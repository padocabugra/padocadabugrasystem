// =============================================================
// Brasil NFe — emissão de NFC-e (Modelo 65)
//
// Server-side apenas: este módulo lê BRASIL_NFE_TOKEN do .env e
// não pode ser importado em client components.
// =============================================================

export interface ItemNFCe {
    nome: string
    ncm?: string
    cfop?: number
    csosn?: string
    quantidade: number
    valorUnitario: number
    unidade?: string
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
        return { ok: false, erro: 'Configuração da API Brasil NFe ausente.' }
    }

    const payload = {
        TipoAmbiente: ambiente,
        ModeloDocumento: 65,
        NaturezaOperacao: 'Venda ao Consumidor Final',
        ConsumidorFinal: true,
        TipoAtendimento: 1,
        Cliente: dados.cpfCliente
            ? { CpfCnpj: dados.cpfCliente, IndicadorIE: 9 }
            : null,
        Produtos: dados.itens.map((item, index) => ({
            NumeroItem: index + 1,
            NmProduto: item.nome,
            NCM: item.ncm || '21069090',
            CFOP: item.cfop || 5102,
            Quantidade: item.quantidade,
            ValorUnitario: item.valorUnitario,
            UnidadeComercial: (item.unidade || 'UN').toUpperCase(),
            OrigemMercadoria: 0,
        })),
        Pagamentos: [
            {
                FormaPagamento: mapearFormaPagamento(dados.formaPagamento),
                ValorPagamento: dados.total,
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
                json?.Mensagem ?? json?.MotivoRejeicao ?? json?.erro ?? `HTTP ${res.status}`
            return { ok: false, erro: String(erro) }
        }

        const chaveAcesso = json?.ChaveAcesso ?? json?.chaveAcesso
        const protocolo = json?.NumeroProtocolo ?? json?.protocolo
        const danfeUrl = json?.UrlDanfe ?? json?.danfeUrl

        if (!chaveAcesso) {
            const motivo =
                json?.MotivoRejeicao ?? json?.Mensagem ?? 'Resposta sem chave de acesso'
            return { ok: false, erro: String(motivo) }
        }

        return { ok: true, chaveAcesso, protocolo, danfeUrl }
    } catch (err: any) {
        return { ok: false, erro: err?.message ?? 'Erro desconhecido' }
    }
}
