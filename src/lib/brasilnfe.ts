// =============================================================
// Brasil NFe — emissão de NFC-e (Modelo 65)
//
// Server-side apenas: este módulo lê BRASIL_NFE_TOKEN do .env e
// não pode ser importado em client components.
// =============================================================

export interface ItemNFCe {
    /** Código do produto (cProd). Pode ser SKU cadastrado ou id sanitizado como fallback. */
    codigo: string
    nome: string
    /** EAN/GTIN do produto (cEAN). Se ausente ou inválido, vai como "SEM GTIN". */
    ean?: string | null
    ncm?: string
    cfop?: number
    csosn?: string
    quantidade: number
    valorUnitario: number
    unidade?: string
}

// SEFAZ rejeita cProd com espaço, acento e caracteres especiais. Mantém somente
// alfanuméricos, hífen, underscore e ponto; colapsa repetidos; limita a 60 chars.
export function sanitizarCodigoProduto(input: string): string {
    const limpo = (input ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .toUpperCase()
        .slice(0, 60)
    return limpo || 'SEM-CODIGO'
}

// EAN/GTIN da SEFAZ aceita "SEM GTIN" (NT 2020.006) ou 8/12/13/14 dígitos com DV válido.
// Não valida o dígito verificador aqui; só checa o comprimento e que sejam só dígitos.
function normalizarEAN(input?: string | null): string {
    const apenasDigitos = (input ?? '').replace(/\D/g, '')
    if ([8, 12, 13, 14].includes(apenasDigitos.length)) return apenasDigitos
    return 'SEM GTIN'
}

// CSOSN é SEMPRE 3 dígitos (102, 103, 300, 400, 500, 900 para NFC-e).
// Telas costumam mostrar "0102" = Origem(0) + CSOSN(102), mas no payload os
// campos são separados. Este helper extrai os 3 últimos dígitos se vier
// concatenado, mantendo CSOSN puro.
function normalizarCSOSN(input?: string | null): string {
    const digitos = (input ?? '').replace(/\D/g, '')
    if (digitos.length === 4) return digitos.slice(1)   // "0102" → "102"
    if (digitos.length === 3) return digitos
    return '102'
}

export interface DadosNFCe {
    itens: ItemNFCe[]
    total: number
    formaPagamento: string
    cpfCliente?: string
}

export interface ResultadoNFCe {
    ok: boolean
    chaveAcesso?: string
    protocolo?: string
    danfeUrl?: string
    erro?: string
    /** Apenas em homologação: response cru da Brasil NFe + payload enviado, pra debug. */
    debug?: {
        statusHttp: number
        payloadEnviado: unknown
        respostaCrua: unknown
    }
}

const FORMA_PAGAMENTO_MAP: Record<string, string> = {
    dinheiro: '01',
    credito: '03',
    debito: '04',
    pix: '17',
}

function mapearFormaPagamento(forma: string): string {
    return FORMA_PAGAMENTO_MAP[forma] ?? '99'
}

export async function emitirNFCe(dados: DadosNFCe): Promise<ResultadoNFCe> {
    const url = process.env.BRASIL_NFE_URL
    const token = process.env.BRASIL_NFE_TOKEN
    const ambiente = Number(process.env.BRASIL_NFE_AMBIENTE ?? '2')

    if (!url || !token) {
        return { ok: false, erro: 'Configuração da API Brasil NFe ausente (BRASIL_NFE_URL / BRASIL_NFE_TOKEN).' }
    }

    const payload = {
        TipoAmbiente: ambiente,
        ModeloDocumento: 65,
        Finalidade: 1,
        NaturezaOperacao: 'Venda ao Consumidor Final',
        ConsumidorFinal: true,
        IndicadorPresenca: 1,
        Cliente: dados.cpfCliente
            ? { CpfCnpj: dados.cpfCliente, IndicadorIe: 9 }
            : null,
        Produtos: dados.itens.map((item) => {
            const unidade = (item.unidade || 'UN').toUpperCase()
            const quantidade = Number(item.quantidade)
            const valorUnitario = Number(item.valorUnitario)
            // vProd é arredondado a 2 casas; a SEFAZ rejeita se o somatório
            // do vProd dos itens divergir do total da nota.
            const valorTotal = Math.round(quantidade * valorUnitario * 100) / 100
            const ean = normalizarEAN(item.ean)
            return {
                CodProduto: sanitizarCodigoProduto(item.codigo),
                NmProduto: item.nome,
                EANComercial: ean,
                EANTributavel: ean,
                NCM: item.ncm || '21069090',
                CFOP: item.cfop || 5102,
                Quantidade: quantidade,
                ValorUnitario: valorUnitario,
                ValorTotalProduto: valorTotal,
                UnidadeComercial: unidade,
                QuantidadeTributavel: quantidade,
                UnidadeTributavel: unidade,
                ValorUnitarioTributavel: valorUnitario,
                IndicadorTotal: 1,
                OrigemProduto: 0,
                Imposto: {
                    ICMS: {
                        CodSituacaoTributaria: normalizarCSOSN(item.csosn),
                    },
                },
            }
        }),
        Pagamentos: [
            {
                IndicadorPagamento: 0,
                FormaPagamento: mapearFormaPagamento(dados.formaPagamento),
                VlPago: dados.total,
            },
        ],
    }

    try {
        const res = await fetch(`${url}/services/Fiscal/EnviarNotaFiscal`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Token: token,
            },
            body: JSON.stringify(payload),
        })

        const json: any = await res.json().catch(() => null)

        // Em homologação registramos request+response completos pra debug
        // de rejeições da SEFAZ. A doc da Brasil NFe não cobre todos os
        // campos; o response é a única fonte autoritativa pra diagnosticar.
        const debug = ambiente === 2
            ? { statusHttp: res.status, payloadEnviado: payload, respostaCrua: json }
            : undefined
        if (debug) {
            console.log('[brasilnfe] payload →', JSON.stringify(payload))
            console.log('[brasilnfe] response (status %d) ←', res.status, JSON.stringify(json))
        }

        if (!res.ok) {
            const erro =
                json?.Error
                ?? json?.ReturnNF?.DsStatusRespostaSefaz
                ?? json?.Mensagem
                ?? json?.MotivoRejeicao
                ?? json?.erro
                ?? `HTTP ${res.status}`
            return { ok: false, erro: String(erro), debug }
        }

        // A API Brasil NFe retorna dados dentro de ReturnNF.
        // Mesmo com HTTP 200, "Ok:false" + campo "Error" ocorre em casos
        // como token inválido ou rejeição antes do envio à SEFAZ.
        const returnNF = json?.ReturnNF
        const isOk = returnNF?.Ok === true
        const chaveAcesso = returnNF?.ChaveNF
        const protocolo = returnNF?.CodStatusRespostaSefaz
            ? String(returnNF.CodStatusRespostaSefaz)
            : undefined

        if (!isOk || !chaveAcesso) {
            const motivo =
                json?.Error
                ?? returnNF?.DsStatusRespostaSefaz
                ?? json?.Mensagem
                ?? json?.MotivoRejeicao
                ?? 'Resposta sem autorização da SEFAZ'
            return { ok: false, erro: String(motivo), debug }
        }

        return { ok: true, chaveAcesso, protocolo, debug }
    } catch (err: any) {
        return { ok: false, erro: err?.message ?? 'Erro desconhecido ao conectar com Brasil NFe' }
    }
}
