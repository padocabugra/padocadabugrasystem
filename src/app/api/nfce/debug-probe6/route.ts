import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Probe v6: suporte da Brasil NFe revelou (2026-05-21) que:
// - O nome correto e CodProdutoServico (nao CodProduto da doc publica)
// - Faltam impostos no payload (precisamos descobrir a estrutura)
//
// Esta rota testa:
// 1. doc oficial + CodProdutoServico apenas (sem imposto) — controle
// 2. variacoes da estrutura de Imposto (singular, plural, com PIS/COFINS,
//    com Origem dentro do ICMS, com CSOSN como chave direta etc.)
// 3. minimo com CodProdutoServico + Imposto simples
// ============================================================================

const SERIE = 1
let proximoNumero = 300

const PAGTO = { TipoPagamento: 1, Valor: 4.15 }
const CLIENTE = { CpfCnpj: '00000000000000', NmCliente: 'Consumidor Final', IndicadorIe: 9 }

function produtoBase(extras: Record<string, unknown> = {}) {
    return {
        CodProdutoServico: '7897520800103',
        NmProduto: 'Agua Lebrinha 500ml',
        NCM: '22011000',
        CFOP: 5102,
        Quantidade: 1,
        ValorUnitario: 4.15,
        ValorTotal: 4.15,
        ...extras,
    }
}

const PAYLOAD_BASE = {
    TipoAmbiente: 2,
    ModeloDocumento: 65,
    NaturezaOperacao: 'Venda ao Consumidor',
    Finalidade: 1,
    ConsumidorFinal: true,
    IndicadorPresenca: 1,
    Cliente: CLIENTE,
    Pagamentos: [PAGTO],
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
            // se aparecer Avisos com info de campo invalido, capturar
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

    const variantes: { id: string; descricao: string; payload: any }[] = [
        {
            id: 'AK_sem_imposto',
            descricao: 'CodProdutoServico SEM nenhum imposto (controle)',
            payload: { ...PAYLOAD_BASE, Produtos: [produtoBase()] },
        },
        {
            id: 'AL_Imposto_singular',
            descricao: '+ Imposto.ICMS.CodSituacaoTributaria: 102',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [produtoBase({
                    Imposto: { ICMS: { CodSituacaoTributaria: '102' } },
                })],
            },
        },
        {
            id: 'AM_Impostos_plural',
            descricao: '+ Impostos[].ICMS.CodSituacaoTributaria: 102 (plural)',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [produtoBase({
                    Impostos: { ICMS: { CodSituacaoTributaria: '102' } },
                })],
            },
        },
        {
            id: 'AN_ICMS_com_Origem',
            descricao: '+ Imposto.ICMS com Origem + CodSituacaoTributaria',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [produtoBase({
                    Imposto: { ICMS: { Origem: 0, CodSituacaoTributaria: '102' } },
                })],
            },
        },
        {
            id: 'AO_ICMS_CSOSN_direto',
            descricao: '+ Imposto.ICMS com CSOSN (chave direta, nome SEFAZ)',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [produtoBase({
                    Imposto: { ICMS: { CSOSN: '102', Origem: 0 } },
                })],
            },
        },
        {
            id: 'AP_completo_PIS_COFINS',
            descricao: '+ Imposto.ICMS + PIS + COFINS (Simples Nacional)',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [produtoBase({
                    Imposto: {
                        ICMS: { Origem: 0, CodSituacaoTributaria: '102' },
                        PIS: { CodSituacaoTributaria: '49' },
                        COFINS: { CodSituacaoTributaria: '49' },
                    },
                })],
            },
        },
        {
            id: 'AQ_payload_producao_atual',
            descricao: 'Payload IGUAL ao de producao (apos fix CodProdutoServico)',
            payload: {
                TipoAmbiente: 2,
                ModeloDocumento: 65,
                Finalidade: 1,
                NaturezaOperacao: 'Venda ao Consumidor Final',
                ConsumidorFinal: true,
                IndicadorPresenca: 1,
                Cliente: null,
                Produtos: [{
                    CodProdutoServico: '7897520800103',
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
                }],
                Pagamentos: [{ IndicadorPagamento: 0, FormaPagamento: '01', VlPago: 4.15 }],
            },
        },
        {
            id: 'AR_minimo_doc_com_imposto',
            descricao: 'Doc oficial limpo + CodProdutoServico + Imposto.ICMS.CST 102',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [produtoBase({
                    Imposto: { ICMS: { Origem: 0, CodSituacaoTributaria: '102' } },
                })],
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
        nota: 'Cada variacao usa numero >=300 pra evitar colisao. CodProdutoServico em todas.',
    })
}
