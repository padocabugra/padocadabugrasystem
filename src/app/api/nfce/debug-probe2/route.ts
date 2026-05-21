import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Probe v2: depois que v1 provou que NENHUM nome de campo de codigo
// resolve (todas as 8 variacoes retornaram erro identico), o problema
// e estrutural — provavelmente falta um identificador de empresa no
// nivel raiz, ou a conta nao esta habilitada para emitir.
//
// Esta rota:
// 1. Tenta endpoints auxiliares pra descobrir empresa(s) vinculada(s)
//    ao token (lista de CNPJs cadastrados na Brasil NFe).
// 2. Testa variacoes do payload com diferentes identificadores no
//    nivel raiz (CnpjEmissor, Empresa, Emitente, Estabelecimento, etc.).
// 3. Tenta tambem o endpoint /services/Empresa/* pra listar config.
// ============================================================================

const CNPJ_PLACEHOLDER = '00000000000191'  // será substituído se descobrirmos o real

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

async function chamar(url: string, token: string, path: string, method: 'GET' | 'POST', body?: unknown) {
    try {
        const res = await fetch(`${url}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Token: token },
            body: body ? JSON.stringify(body) : undefined,
        })
        const text = await res.text()
        let parsed: unknown
        try { parsed = JSON.parse(text) } catch { parsed = text }
        return { httpStatus: res.status, response: parsed }
    } catch (err: any) {
        return { erroRede: err?.message ?? 'falha de rede' }
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

    // ── Parte 1: endpoints auxiliares pra descobrir conta ──
    const endpointsAuxiliares = [
        { path: '/services/Empresa/Obter', method: 'GET' as const },
        { path: '/services/Empresa/Listar', method: 'GET' as const },
        { path: '/services/Empresa', method: 'GET' as const },
        { path: '/services/Conta', method: 'GET' as const },
        { path: '/services/Conta/Obter', method: 'GET' as const },
        { path: '/services/Usuario', method: 'GET' as const },
        { path: '/services/Usuario/Obter', method: 'GET' as const },
        { path: '/services/Fiscal/Empresa', method: 'GET' as const },
        { path: '/services/Fiscal/Configuracao', method: 'GET' as const },
        { path: '/api/v1/empresas', method: 'GET' as const },
        { path: '/v1/empresas', method: 'GET' as const },
        { path: '/empresas', method: 'GET' as const },
    ]

    const descoberta: unknown[] = []
    for (const ep of endpointsAuxiliares) {
        const r = await chamar(url, token, ep.path, ep.method)
        descoberta.push({ endpoint: ep.path, ...r })
    }

    // ── Parte 2: variacoes do payload com identificador de empresa no raiz ──
    const variantes: { id: string; descricao: string; extra: Record<string, unknown> }[] = [
        { id: 'I_CnpjEmissor', descricao: '+ CnpjEmissor raiz', extra: { CnpjEmissor: CNPJ_PLACEHOLDER } },
        { id: 'J_Emissor', descricao: '+ Emissor.CpfCnpj', extra: { Emissor: { CpfCnpj: CNPJ_PLACEHOLDER } } },
        { id: 'K_Empresa_cnpj', descricao: '+ Empresa.Cnpj', extra: { Empresa: { Cnpj: CNPJ_PLACEHOLDER } } },
        { id: 'L_Emitente', descricao: '+ Emitente.CpfCnpj', extra: { Emitente: { CpfCnpj: CNPJ_PLACEHOLDER } } },
        { id: 'M_Estabelecimento', descricao: '+ Estabelecimento.Cnpj', extra: { Estabelecimento: { Cnpj: CNPJ_PLACEHOLDER } } },
        { id: 'N_CnpjEmpresa', descricao: '+ CnpjEmpresa raiz', extra: { CnpjEmpresa: CNPJ_PLACEHOLDER } },
        { id: 'O_payload_minimo', descricao: 'payload super minimo: so TipoAmbiente+Produtos', extra: {} },
    ]

    const resultadosPayload: unknown[] = []
    for (const v of variantes) {
        const payload = v.id === 'O_payload_minimo'
            ? { TipoAmbiente: 2, Produtos: [PRODUTO_BASE] }
            : { ...PAYLOAD_BASE, ...v.extra }
        const r = await chamar(url, token, '/services/Fiscal/EnviarNotaFiscal', 'POST', payload)
        const respObj = (r as any).response
        const error = respObj?.Error ?? respObj?.ReturnNF?.DsStatusRespostaSefaz ?? null
        resultadosPayload.push({
            id: v.id,
            descricao: v.descricao,
            httpStatus: (r as any).httpStatus,
            error,
            okSefaz: respObj?.ReturnNF?.Ok ?? null,
            codSefaz: respObj?.ReturnNF?.CodStatusRespostaSefaz ?? null,
        })
    }

    return NextResponse.json({
        tokenLen: token.length,
        tokenPrimeiros8: token.slice(0, 8) + '...',
        ambiente,
        url,
        descobertaEndpointsAuxiliares: descoberta,
        resultadosPayloadComEmpresa: resultadosPayload,
    })
}
