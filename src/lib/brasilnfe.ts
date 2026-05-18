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
        Produtos: dados.itens.map((item) => ({
            CodProduto: sanitizarCodigoProduto(item.codigo),
            NmProduto: item.nome,
            NCM: item.ncm || '21069090',
            CFOP: item.cfop || 5102,
            Quantidade: item.quantidade,
            ValorUnitario: item.valorUnitario,
            UnidadeComercial: (item.unidade || 'UN').toUpperCase(),
            OrigemProduto: 0,
            Imposto: {
                ICMS: {
                    CodSituacaoTributaria: item.csosn || '0102',
                },
            },
        })),
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

        if (!res.ok) {
            const erro =
                json?.Error
                ?? json?.ReturnNF?.DsStatusRespostaSefaz
                ?? json?.Mensagem
                ?? json?.MotivoRejeicao
                ?? json?.erro
                ?? `HTTP ${res.status}`
            return { ok: false, erro: String(erro) }
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
            return { ok: false, erro: String(motivo) }
        }

        return { ok: true, chaveAcesso, protocolo }
    } catch (err: any) {
        return { ok: false, erro: err?.message ?? 'Erro desconhecido ao conectar com Brasil NFe' }
    }
}
