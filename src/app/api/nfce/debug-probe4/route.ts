import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Probe v4: V3 revelou que a Brasil NFe valida em ordem:
//   Serie -> Numero -> ModeloDocumento -> Produto -> ...
// E que omitir qualquer um quebra com mensagem ENGANOSA. O "controle interno"
// (N° Padrão: Sim no painel) nao funciona — precisa enviar Serie+Numero
// explicitamente.
//
// Esta rota:
// 1. Confirma que Serie+Numero+ModeloDocumento no payload minimo destrava
//    a validacao ate o produto (e expoe o erro REAL do produto).
// 2. Testa o payload COMPLETO (igual ao de producao) + Serie + Numero.
// 3. Variacoes de Numero (proximos numeros possiveis pra evitar duplicacao).
// ============================================================================

const PRODUTO_BASE = {
    CodProduto: '7897520800103',
    NmProduto: 'Agua Lebrinha 500ml',
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
    Produtos: [PRODUTO_BASE],
    Pagamentos: [{ IndicadorPagamento: 0, FormaPagamento: '01', VlPago: 4.15 }],
}

async function chamar(url: string, token: string, body: unknown) {
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

    // Cada chamada bem-sucedida (ou que chegue na SEFAZ) consome 1 numero.
    // Usamos numeros bem altos pra evitar conflito com possiveis emissoes do user.
    const variantes: { id: string; descricao: string; payload: unknown }[] = [
        {
            id: 'X_minimo_3_chaves',
            descricao: 'minimo + Serie 1 + Numero N + Modelo 65 — espera-se proximo erro real',
            payload: { TipoAmbiente: 2, ModeloDocumento: 65, Serie: 1, Numero: 100, Produtos: [PRODUTO_BASE] },
        },
        {
            id: 'Y_completo_serie_numero',
            descricao: 'payload completo (estilo producao) + Serie 1 + Numero N',
            payload: { ...PAYLOAD_BASE, Serie: 1, Numero: 101 },
        },
        {
            id: 'Z_completo_sem_pagamentos',
            descricao: 'completo - Pagamentos + Serie + Numero (testa se Pagamentos confunde)',
            payload: { ...PAYLOAD_BASE, Pagamentos: undefined, Serie: 1, Numero: 102 },
        },
        {
            id: 'AA_completo_sem_produtos',
            descricao: 'completo + Serie + Numero MAS SEM Produtos (testa qual proximo erro)',
            payload: { ...PAYLOAD_BASE, Produtos: [], Serie: 1, Numero: 103 },
        },
        {
            id: 'AB_completo_produto_minimo',
            descricao: 'completo + Serie + Numero + Produto com SO os 4 campos da doc oficial',
            payload: {
                ...PAYLOAD_BASE,
                Serie: 1,
                Numero: 104,
                Produtos: [{
                    NmProduto: 'Agua 500ml',
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
        nota: 'numeros >=100 usados pra evitar colisao com proximo numero real (6)',
    })
}
