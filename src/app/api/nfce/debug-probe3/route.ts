import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Probe v3: depois que v2 revelou (via payload minimo) que o erro real é
// "A série ou número da NFC-e não foi enviado (A empresa não possúi séries
// cadastradas no controle interno de numeração)", e o usuario confirmou que
// a série 1 está cadastrada pra modelo 65 (Próximo Número: 6 em homologação),
// existe um descompasso: a Brasil NFe nao esta usando o controle automatico.
//
// Esta rota testa variacoes enviando Serie (e Numero) EXPLICITAMENTE no
// payload, em diferentes posicoes e formatos, pra descobrir qual encaixa.
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
            respostaCrua: parsed,
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

    // Variacoes: cada uma adiciona Serie/Numero de um jeito diferente
    const variantes: { id: string; descricao: string; payload: unknown }[] = [
        {
            id: 'P_Serie_raiz_num',
            descricao: 'Serie: 1 no raiz (number)',
            payload: { ...PAYLOAD_BASE, Serie: 1 },
        },
        {
            id: 'Q_Serie_raiz_str',
            descricao: 'Serie: "1" no raiz (string)',
            payload: { ...PAYLOAD_BASE, Serie: '1' },
        },
        {
            id: 'R_Serie_e_Numero',
            descricao: 'Serie: 1 + Numero: 6 no raiz',
            payload: { ...PAYLOAD_BASE, Serie: 1, Numero: 6 },
        },
        {
            id: 'S_NrSerie_NrNota',
            descricao: 'NrSerie + NrNota (alternativa)',
            payload: { ...PAYLOAD_BASE, NrSerie: 1, NrNota: 6 },
        },
        {
            id: 'T_SerieDocumento',
            descricao: 'SerieDocumento + NumeroDocumento',
            payload: { ...PAYLOAD_BASE, SerieDocumento: 1, NumeroDocumento: 6 },
        },
        {
            id: 'U_minimo_serie',
            descricao: 'Payload minimo + Serie 1',
            payload: { TipoAmbiente: 2, Serie: 1, Produtos: [PRODUTO_BASE] },
        },
        {
            id: 'V_minimo_serie_numero',
            descricao: 'Payload minimo + Serie 1 + Numero 6',
            payload: { TipoAmbiente: 2, Serie: 1, Numero: 6, Produtos: [PRODUTO_BASE] },
        },
        {
            id: 'W_serie_no_modelo',
            descricao: 'ModeloDocumento como objeto com serie',
            payload: { ...PAYLOAD_BASE, ModeloDocumento: { Modelo: 65, Serie: 1 } },
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
    })
}
