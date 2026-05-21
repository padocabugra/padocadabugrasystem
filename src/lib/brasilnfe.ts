// =============================================================
// Brasil NFe — emissão de NFC-e (Modelo 65)
//
// Server-side apenas: este módulo lê BRASIL_NFE_TOKEN do .env e
// não pode ser importado em client components.
//
// Estrutura do payload validada por trabalho com o suporte oficial
// da Brasil NFe (2026-05-21) — a doc pública em /products/nfc-e
// está incompleta. Diferenças críticas do que a doc mostra:
//
//   campo na doc            → nome real na API
//   ────────────────────────────────────────────
//   CodProduto              → CodProdutoServico
//   ValorTotalProduto       → ValorTotal
//   (não mostrado)          → UnidadeComercial (obrigatório)
//   só ICMS                 → ICMS + PIS + COFINS (obrigatórios)
//   Serie/Numero no payload → controle automático pelo painel
//                             (NÃO enviar; senão pula numeração)
//   (não mostrado)          → IdentificadorInterno (idempotência)
//
// =============================================================

export interface ItemNFCe {
    /** Código do produto (cProd). Pode ser SKU cadastrado ou id sanitizado como fallback. */
    codigo: string
    nome: string
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

// CSOSN é SEMPRE 3 dígitos (102, 103, 300, 400, 500, 900 para NFC-e).
// Telas costumam mostrar "0102" = Origem(0) + CSOSN(102), mas no payload os
// campos são separados. Este helper extrai os 3 últimos dígitos se vier
// concatenado, mantendo CSOSN puro.
function normalizarCSOSN(input?: string | null): string {
    const digitos = (input ?? '').replace(/\D/g, '')
    if (digitos.length === 4) return digitos.slice(1)
    if (digitos.length === 3) return digitos
    return '102'
}

// xProd (descrição do produto) da NFC-e: SEFAZ aceita UTF-8 em tese, mas
// integradores como a Brasil NFe rejeitam acentos. Normaliza removendo
// diacríticos, chars de controle e símbolos que quebram XML. Limita a 120.
function sanitizarNomeProduto(input: string): string {
    const limpo = (input ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^ -~]/g, '')
        .replace(/[<>&"]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120)
    return limpo || 'Produto'
}

export interface DadosNFCe {
    itens: ItemNFCe[]
    total: number
    formaPagamento: string
    cpfCliente?: string
    /** ID único do pedido para idempotência (IdentificadorInterno na API). */
    identificadorInterno?: string
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

    // IdentificadorInterno: único por tentativa de emissão (não por pedido).
    // A Brasil NFe usa pra deduplicar. Combinar pedidoId + timestamp garante
    // que uma reemissão após falha consiga passar (sem ser bloqueada como duplicada).
    const identificadorInterno = dados.identificadorInterno
        ? `${dados.identificadorInterno}-${Date.now()}`
        : `pdv-${Date.now()}`

    const payload = {
        TipoAmbiente: ambiente,
        ModeloDocumento: 65,
        Finalidade: 1,
        NaturezaOperacao: 'Venda ao Consumidor',
        ConsumidorFinal: true,
        IndicadorPresenca: 1,
        IdentificadorInterno: identificadorInterno,
        // Brasil NFe controla Série e Número automaticamente via painel
        // (Modelo 65, Série 1, N° Padrão: Sim). NÃO ENVIAR Serie/Numero
        // — senão a numeração começa a pular conforme tentativas falhas.
        Cliente: dados.cpfCliente
            ? { CpfCnpj: dados.cpfCliente, IndicadorIe: 9 }
            : { CpfCnpj: '00000000000000', NmCliente: 'Consumidor Final', IndicadorIe: 9 },
        Produtos: dados.itens.map((item) => {
            const unidade = (item.unidade || 'UN').toUpperCase()
            const quantidade = Number(item.quantidade)
            const valorUnitario = Number(item.valorUnitario)
            const valorTotal = Math.round(quantidade * valorUnitario * 100) / 100
            return {
                CodProdutoServico: sanitizarCodigoProduto(item.codigo),
                NmProduto: sanitizarNomeProduto(item.nome),
                NCM: item.ncm || '21069090',
                CFOP: item.cfop || 5102,
                UnidadeComercial: unidade,
                Quantidade: quantidade,
                ValorUnitario: valorUnitario,
                ValorTotal: valorTotal,
                Imposto: {
                    // Simples Nacional: ICMS sem destaque (CSOSN), PIS/COFINS
                    // sem incidência (CST 49). A API calcula valores automaticamente.
                    ICMS: { Origem: 0, CodSituacaoTributaria: normalizarCSOSN(item.csosn) },
                    PIS: { CodSituacaoTributaria: '49' },
                    COFINS: { CodSituacaoTributaria: '49' },
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

        // Em homologação registramos request+response completos pra debug.
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
