import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Probe v5: descobri a doc oficial em /products/nfc-e. Ela mostra uma
// estrutura BEM DIFERENTE da que estamos usando:
//
// - Produto usa "ValorTotal" (nao "ValorTotalProduto")
// - Produto tem APENAS 6 campos: NmProduto, NCM, CFOP, Quantidade,
//   ValorUnitario, ValorTotal. Nada de EAN, Imposto, IndicadorTotal,
//   OrigemProduto, etc.
// - Pagamento usa "TipoPagamento" (number) e "Valor" — nao "FormaPagamento"
//   (string "01") e "VlPago"
// - Cliente sempre objeto (CpfCnpj + NmCliente + IndicadorIe), nao null
// - NaturezaOperacao "Venda ao Consumidor" (sem "Final")
//
// Esta rota testa essa estrutura limpa + variacoes.
// ============================================================================

const SERIE = 1
let proximoNumero = 200  // numeros altos pra evitar colisao

const PAGTO_DOC = { TipoPagamento: 1, Valor: 4.15 }
const CLIENTE_DOC = { CpfCnpj: '00000000000000', NmCliente: 'Consumidor Final', IndicadorIe: 9 }

const PRODUTO_DOC = {
    NmProduto: 'Agua Lebrinha 500ml',
    NCM: '22011000',
    CFOP: 5102,
    Quantidade: 1,
    ValorUnitario: 4.15,
    ValorTotal: 4.15,
}

const PAYLOAD_DOC_OFICIAL = {
    TipoAmbiente: 2,
    ModeloDocumento: 65,
    NaturezaOperacao: 'Venda ao Consumidor',
    Finalidade: 1,
    ConsumidorFinal: true,
    IndicadorPresenca: 1,
    Cliente: CLIENTE_DOC,
    Produtos: [PRODUTO_DOC],
    Pagamentos: [PAGTO_DOC],
}

async function chamar(url: string, token: string, body: any) {
    body.Serie = SERIE
    body.Numero = proximoNumero++
    try {
        const res = await fetch(`${url}/services/Fiscal/EnviarNotaFiscal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Token: token },
            body: JSON.stringify(body),
        })
        const text = await res.text()
        let parsed: any
        try { parsed = JSON.parse(text) } catch { parsed = text }
        return {
            httpStatus: res.status,
            error: parsed?.Error ?? parsed?.ReturnNF?.DsStatusRespostaSefaz ?? null,
            okSefaz: parsed?.ReturnNF?.Ok ?? null,
            codSefaz: parsed?.ReturnNF?.CodStatusRespostaSefaz ?? null,
            chaveNF: parsed?.ReturnNF?.ChaveNF ?? null,
            numero: parsed?.ReturnNF?.Numero ?? null,
            serie: parsed?.ReturnNF?.Serie ?? null,
        }
    } catch (err: any) {
        return { erroRede: err?.message ?? 'falha' }
    }
}

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, erro: 'Nao autorizado' }, { status: 401 })
    const { data: usuario } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    if (!usuario || usuario.role !== 'admin') {
        return NextResponse.json({ ok: false, erro: 'Apenas admin' }, { status: 403 })
    }

    const url = process.env.BRASIL_NFE_URL
    const token = process.env.BRASIL_NFE_TOKEN
    const ambiente = Number(process.env.BRASIL_NFE_AMBIENTE ?? '2')
    if (!url || !token) return NextResponse.json({ ok: false, erro: 'env ausente' }, { status: 500 })
    if (ambiente !== 2) return NextResponse.json({ ok: false, erro: 'so homologacao' }, { status: 400 })

    const variantes: { id: string; descricao: string; payload: any }[] = [
        {
            id: 'AC_doc_oficial_estrita',
            descricao: 'Payload EXATO da doc oficial',
            payload: JSON.parse(JSON.stringify(PAYLOAD_DOC_OFICIAL)),
        },
        {
            id: 'AD_doc_sem_cliente',
            descricao: 'Doc oficial - SEM Cliente (NFC-e teoricamente nao precisa)',
            payload: { ...JSON.parse(JSON.stringify(PAYLOAD_DOC_OFICIAL)), Cliente: null },
        },
        {
            id: 'AE_doc_consumidor_cnpj_zero',
            descricao: 'Doc oficial mas Cliente com CpfCnpj zerado',
            payload: { ...JSON.parse(JSON.stringify(PAYLOAD_DOC_OFICIAL)), Cliente: { CpfCnpj: '00000000000', NmCliente: 'Consumidor', IndicadorIe: 9 } },
        },
        {
            id: 'AF_doc_natureza_completa',
            descricao: 'Doc oficial + NaturezaOperacao "Venda ao Consumidor Final"',
            payload: { ...JSON.parse(JSON.stringify(PAYLOAD_DOC_OFICIAL)), NaturezaOperacao: 'Venda ao Consumidor Final' },
        },
        {
            id: 'AG_doc_TipoPagamento_string',
            descricao: 'Doc oficial mas TipoPagamento como string "01"',
            payload: {
                ...JSON.parse(JSON.stringify(PAYLOAD_DOC_OFICIAL)),
                Pagamentos: [{ TipoPagamento: '01', Valor: 4.15 }],
            },
        },
        {
            id: 'AH_doc_FormaPagamento_legado',
            descricao: 'Doc oficial mas com IndicadorPagamento+FormaPagamento+VlPago (estilo antigo)',
            payload: {
                ...JSON.parse(JSON.stringify(PAYLOAD_DOC_OFICIAL)),
                Pagamentos: [{ IndicadorPagamento: 0, FormaPagamento: '01', VlPago: 4.15 }],
            },
        },
        {
            id: 'AI_doc_ValorTotalProduto_antigo',
            descricao: 'Doc oficial mas com ValorTotalProduto (nome antigo) em vez de ValorTotal',
            payload: {
                ...JSON.parse(JSON.stringify(PAYLOAD_DOC_OFICIAL)),
                Produtos: [{
                    NmProduto: 'Agua Lebrinha 500ml',
                    NCM: '22011000',
                    CFOP: 5102,
                    Quantidade: 1,
                    ValorUnitario: 4.15,
                    ValorTotalProduto: 4.15,
                }],
            },
        },
        {
            id: 'AJ_doc_so_5_campos',
            descricao: 'Doc oficial - removo ValorTotal do produto (so 5 campos)',
            payload: {
                ...JSON.parse(JSON.stringify(PAYLOAD_DOC_OFICIAL)),
                Produtos: [{
                    NmProduto: 'Agua Lebrinha 500ml',
                    NCM: '22011000',
                    CFOP: 5102,
                    Quantidade: 1,
                    ValorUnitario: 4.15,
                }],
            },
        },
    ]

    const resultados: unknown[] = []
    for (const v of variantes) {
        const r = await chamar(url, token, v.payload)
        resultados.push({ id: v.id, descricao: v.descricao, ...r })
    }

    return NextResponse.json({
        tokenLen: token.length,
        ambiente,
        url,
        resultados,
        nota: 'Cada variacao usa numero sequencial >=200 pra evitar colisao',
    })
}
