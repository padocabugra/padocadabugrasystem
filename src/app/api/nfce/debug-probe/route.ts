import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Endpoint de diagnóstico: tenta variações do payload pra descobrir cirurgicamente
// qual nome de campo / formato a Brasil NFe aceita.
//
// - Apenas admin (mesma restrição do /emitir)
// - Apenas homologação (BRASIL_NFE_AMBIENTE=2) — não dispara nada em prod
// - Faz N chamadas sequenciais com payloads ligeiramente diferentes
// - Retorna o erro/sucesso de cada variação pra comparação
//
// REMOVER esta rota após o bug ser resolvido.
// ============================================================================

const PRODUTO_BASE = {
    NmProduto: 'Agua Lebrinha sem Gas 500ml',
    EANComercial: '7897520800103',
    EANTributavel: '7897520800103',
    NCM: '22011000',
    CFOP: 5102,
    Quantidade: 1,
    ValorUnitario: 4.15,
    ValorTotalProduto: 4.15,
    UnidadeComercial: 'UN',
    QuantidadeTributavel: 1,
    UnidadeTributavel: 'UN',
    ValorUnitarioTributavel: 4.15,
    IndicadorTotal: 1,
    OrigemProduto: 0,
    Imposto: { ICMS: { CodSituacaoTributaria: '102' } },
}

const PAYLOAD_BASE = {
    TipoAmbiente: 2,
    ModeloDocumento: 65,
    Finalidade: 1,
    NaturezaOperacao: 'Venda ao Consumidor Final',
    ConsumidorFinal: true,
    IndicadorPresenca: 1,
    Cliente: null,
    Pagamentos: [{ IndicadorPagamento: 0, FormaPagamento: '01', VlPago: 4.15 }],
}

const CODIGO_VALOR = '7897520800103'

const VARIANTES: { id: string; descricao: string; produto: Record<string, unknown> }[] = [
    {
        id: 'A_controle',
        descricao: 'Payload atual (CodProduto)',
        produto: { CodProduto: CODIGO_VALOR, ...PRODUTO_BASE },
    },
    {
        id: 'B_CodigoProduto',
        descricao: 'Renomear pra CodigoProduto',
        produto: { CodigoProduto: CODIGO_VALOR, ...PRODUTO_BASE },
    },
    {
        id: 'C_Codigo',
        descricao: 'Renomear pra Codigo',
        produto: { Codigo: CODIGO_VALOR, ...PRODUTO_BASE },
    },
    {
        id: 'D_cProd',
        descricao: 'Renomear pra cProd (nome tecnico SEFAZ)',
        produto: { cProd: CODIGO_VALOR, ...PRODUTO_BASE },
    },
    {
        id: 'E_CodProd',
        descricao: 'Renomear pra CodProd (abreviado)',
        produto: { CodProd: CODIGO_VALOR, ...PRODUTO_BASE },
    },
    {
        id: 'F_promiscuo',
        descricao: 'TODOS os nomes ao mesmo tempo',
        produto: {
            CodProduto: CODIGO_VALOR,
            CodigoProduto: CODIGO_VALOR,
            Codigo: CODIGO_VALOR,
            cProd: CODIGO_VALOR,
            CodProd: CODIGO_VALOR,
            ...PRODUTO_BASE,
        },
    },
    {
        id: 'G_sem_codigo',
        descricao: 'Sem nenhum campo de codigo',
        produto: { ...PRODUTO_BASE },
    },
    {
        id: 'H_NmProduto_sem_espaco',
        descricao: 'CodProduto + NmProduto com underscores no lugar de espaco',
        produto: {
            CodProduto: CODIGO_VALOR,
            ...PRODUTO_BASE,
            NmProduto: 'Agua_Lebrinha_sem_Gas_500ml',
        },
    },
]

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ ok: false, erro: 'Nao autorizado' }, { status: 401 })
    }
    const { data: usuario } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
    if (!usuario || usuario.role !== 'admin') {
        return NextResponse.json({ ok: false, erro: 'Apenas admin' }, { status: 403 })
    }

    const url = process.env.BRASIL_NFE_URL
    const token = process.env.BRASIL_NFE_TOKEN
    const ambiente = Number(process.env.BRASIL_NFE_AMBIENTE ?? '2')
    if (!url || !token) {
        return NextResponse.json({ ok: false, erro: 'BRASIL_NFE_URL/TOKEN ausentes' }, { status: 500 })
    }
    if (ambiente !== 2) {
        return NextResponse.json({ ok: false, erro: 'Recuso rodar fora de homologacao' }, { status: 400 })
    }

    const resultados: unknown[] = []
    for (const variante of VARIANTES) {
        const payload = { ...PAYLOAD_BASE, Produtos: [variante.produto] }
        try {
            const res = await fetch(`${url}/services/Fiscal/EnviarNotaFiscal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Token: token },
                body: JSON.stringify(payload),
            })
            const text = await res.text()
            let body: unknown
            try { body = JSON.parse(text) } catch { body = text }
            const b = body as Record<string, any>
            const error = b?.Error ?? b?.ReturnNF?.DsStatusRespostaSefaz ?? null
            const ok = b?.ReturnNF?.Ok === true
            resultados.push({
                id: variante.id,
                descricao: variante.descricao,
                httpStatus: res.status,
                ok,
                error,
                returnSefazCod: b?.ReturnNF?.CodStatusRespostaSefaz ?? null,
                returnSefazDs: b?.ReturnNF?.DsStatusRespostaSefaz ?? null,
                respostaCrua: body,
            })
        } catch (err: any) {
            resultados.push({
                id: variante.id,
                descricao: variante.descricao,
                erroRede: err?.message ?? 'falha de rede',
            })
        }
    }

    return NextResponse.json({
        tokenLen: token.length,
        ambiente,
        url,
        resultados,
    })
}
