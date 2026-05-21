import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Probe v7: V6 revelou que CodProdutoServico esta correto. Agora a API
// reclama de "Unidade Comercial/Medida" (quando ausente) e "valor total
// invalido" (quando enviamos ValorTotalProduto). Hipotese: o nome correto
// e ValorTotal (sem "Produto"), confirmando a doc /products/nfc-e.
//
// Esta rota testa o salto final: payload completo com CodProdutoServico +
// UnidadeComercial + ValorTotal (sem "Produto") + variacoes de Imposto.
// ============================================================================

const SERIE = 1
let proximoNumero = 400

const PAGTO = { TipoPagamento: 1, Valor: 4.15 }
const CLIENTE = { CpfCnpj: '00000000000000', NmCliente: 'Consumidor Final', IndicadorIe: 9 }

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

    function produtoLimpo(extras: Record<string, unknown> = {}) {
        return {
            CodProdutoServico: '7897520800103',
            NmProduto: 'Agua Lebrinha 500ml',
            NCM: '22011000',
            CFOP: 5102,
            UnidadeComercial: 'UN',
            Quantidade: 1,
            ValorUnitario: 4.15,
            ValorTotal: 4.15,    // doc oficial usa ValorTotal (nao ValorTotalProduto)
            ...extras,
        }
    }

    const variantes: { id: string; descricao: string; payload: any }[] = [
        {
            id: 'AS_limpo_ValorTotal',
            descricao: 'CodProdutoServico + UnidadeComercial + ValorTotal (sem imposto)',
            payload: { ...PAYLOAD_BASE, Produtos: [produtoLimpo()] },
        },
        {
            id: 'AT_limpo_ValorTotalProduto',
            descricao: 'Mesmo MAS com ValorTotalProduto (testa qual nome a API aceita)',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [{
                    CodProdutoServico: '7897520800103',
                    NmProduto: 'Agua Lebrinha 500ml',
                    NCM: '22011000',
                    CFOP: 5102,
                    UnidadeComercial: 'UN',
                    Quantidade: 1,
                    ValorUnitario: 4.15,
                    ValorTotalProduto: 4.15,
                }],
            },
        },
        {
            id: 'AU_limpo_sem_valor_total',
            descricao: 'Mesmo SEM ValorTotal nem ValorTotalProduto (a API calcula?)',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [{
                    CodProdutoServico: '7897520800103',
                    NmProduto: 'Agua Lebrinha 500ml',
                    NCM: '22011000',
                    CFOP: 5102,
                    UnidadeComercial: 'UN',
                    Quantidade: 1,
                    ValorUnitario: 4.15,
                }],
            },
        },
        {
            id: 'AV_limpo_Imposto_CST',
            descricao: 'AS + Imposto.ICMS.CodSituacaoTributaria: 102',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [produtoLimpo({
                    Imposto: { ICMS: { CodSituacaoTributaria: '102' } },
                })],
            },
        },
        {
            id: 'AW_limpo_Imposto_Origem_CST',
            descricao: 'AS + Imposto.ICMS com Origem 0 + CodSituacaoTributaria 102',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [produtoLimpo({
                    Imposto: { ICMS: { Origem: 0, CodSituacaoTributaria: '102' } },
                })],
            },
        },
        {
            id: 'AX_limpo_Imposto_PIS_COFINS',
            descricao: 'AS + Imposto ICMS+PIS+COFINS completo',
            payload: {
                ...PAYLOAD_BASE,
                Produtos: [produtoLimpo({
                    Imposto: {
                        ICMS: { Origem: 0, CodSituacaoTributaria: '102' },
                        PIS: { CodSituacaoTributaria: '49' },
                        COFINS: { CodSituacaoTributaria: '49' },
                    },
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
        nota: 'Cada variacao usa numero >=400 pra evitar colisao',
    })
}
