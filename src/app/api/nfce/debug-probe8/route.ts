import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Probe v8: V7 AX confirmou que CodProdutoServico + UnidadeComercial +
// ValorTotal + Imposto(ICMS+PIS+COFINS) passa TODA a validacao de produto.
// Ultimo erro: "O pagamento N° 1 possui a forma de pagamento invalida!"
//
// Estavamos enviando { TipoPagamento: 1, Valor: 4.15 } (formato da doc).
// Testa variacoes do nome/valor do tipo de pagamento.
//
// Tabela SEFAZ tPag: 01=Dinheiro, 02=Cheque, 03=Cartao Credito,
// 04=Cartao Debito, 05=Credito Loja, 10=Vale Alimentacao, 11=Vale Refeicao,
// 12=Vale Presente, 13=Vale Combustivel, 17=PIX, 99=Outros
// ============================================================================

const SERIE = 1
let proximoNumero = 500

const CLIENTE = { CpfCnpj: '00000000000000', NmCliente: 'Consumidor Final', IndicadorIe: 9 }

const PRODUTO_VALIDADO = {
    CodProdutoServico: '7897520800103',
    NmProduto: 'Agua Lebrinha 500ml',
    NCM: '22011000',
    CFOP: 5102,
    UnidadeComercial: 'UN',
    Quantidade: 1,
    ValorUnitario: 4.15,
    ValorTotal: 4.15,
    Imposto: {
        ICMS: { Origem: 0, CodSituacaoTributaria: '102' },
        PIS: { CodSituacaoTributaria: '49' },
        COFINS: { CodSituacaoTributaria: '49' },
    },
}

const PAYLOAD_BASE = {
    TipoAmbiente: 2,
    ModeloDocumento: 65,
    NaturezaOperacao: 'Venda ao Consumidor',
    Finalidade: 1,
    ConsumidorFinal: true,
    IndicadorPresenca: 1,
    Cliente: CLIENTE,
    Produtos: [PRODUTO_VALIDADO],
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
            avisos: parsed?.Avisos ?? null,
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

    const variantes: { id: string; descricao: string; pagamento: any }[] = [
        {
            id: 'AY_TipoPagamento_str_01',
            descricao: 'TipoPagamento: "01" (string com zero) + Valor 4.15',
            pagamento: { TipoPagamento: '01', Valor: 4.15 },
        },
        {
            id: 'AZ_FormaPagamento_str',
            descricao: 'FormaPagamento: "01" + Valor 4.15 (renomeia campo)',
            pagamento: { FormaPagamento: '01', Valor: 4.15 },
        },
        {
            id: 'BA_legado_completo',
            descricao: 'IndicadorPagamento + FormaPagamento + VlPago (estilo antigo)',
            pagamento: { IndicadorPagamento: 0, FormaPagamento: '01', VlPago: 4.15 },
        },
        {
            id: 'BB_FormaPagamento_num_1',
            descricao: 'FormaPagamento: 1 (number) + Valor 4.15',
            pagamento: { FormaPagamento: 1, Valor: 4.15 },
        },
        {
            id: 'BC_TipoPagamento_dinheiro_str',
            descricao: 'TipoPagamento: "Dinheiro" (string nome)',
            pagamento: { TipoPagamento: 'Dinheiro', Valor: 4.15 },
        },
        {
            id: 'BD_CodFormaPagamento',
            descricao: 'CodFormaPagamento: "01" + ValorPago: 4.15',
            pagamento: { CodFormaPagamento: '01', ValorPago: 4.15 },
        },
        {
            id: 'BE_FormaPagamento_e_TipoPagamento',
            descricao: 'FormaPagamento + TipoPagamento juntos',
            pagamento: { FormaPagamento: '01', TipoPagamento: 1, Valor: 4.15 },
        },
        {
            id: 'BF_completo_legado_com_FormaPagamento',
            descricao: 'IndicadorPagamento + FormaPagamento(01) + Valor (mix)',
            pagamento: { IndicadorPagamento: 0, FormaPagamento: '01', Valor: 4.15 },
        },
    ]

    const resultados: unknown[] = []
    for (const v of variantes) {
        const payload = { ...PAYLOAD_BASE, Pagamentos: [v.pagamento] }
        const r = await chamar(url, token, payload)
        resultados.push({ id: v.id, descricao: v.descricao, ...r })
    }

    return NextResponse.json({
        tokenLen: token.length,
        ambiente,
        url,
        resultados,
        nota: 'Cada variacao usa numero >=500. Produto JA VALIDADO em todas — varia so o pagamento.',
    })
}
