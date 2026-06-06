import { NextResponse } from 'next/server'
import { emitirNFCe, type ItemNFCe } from '@/lib/brasilnfe'
import { createClient } from '@/lib/supabase/server'

// Formas de pagamento válidas — rejeita qualquer outra
const FORMAS_VALIDAS = new Set(['dinheiro', 'credito', 'debito', 'pix'])

export async function POST(req: Request) {
    try {
        // ── Autenticação obrigatória ──────────────────────────────────
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json(
                { ok: false, erro: 'Não autorizado. Faça login novamente.' },
                { status: 401 }
            )
        }

        // ── Autorização — somente admin e caixa ──────────────────────
        const { data: usuario } = await supabase
            .from('usuarios')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!usuario || !['admin', 'caixa'].includes(usuario.role)) {
            return NextResponse.json(
                { ok: false, erro: 'Permissão insuficiente para emitir NFC-e.' },
                { status: 403 }
            )
        }

        // ── Validação de payload ─────────────────────────────────────
        const body = await req.json()
        const { pedidoId, pedidoIds, itens, total, formaPagamento, cpfCliente } = body ?? {}

        if (!Array.isArray(itens) || itens.length === 0 || !total || !formaPagamento) {
            return NextResponse.json(
                { ok: false, erro: 'Dados inválidos: itens, total e formaPagamento são obrigatórios.' },
                { status: 400 }
            )
        }

        if (!FORMAS_VALIDAS.has(formaPagamento)) {
            return NextResponse.json(
                { ok: false, erro: 'Forma de pagamento inválida.' },
                { status: 400 }
            )
        }

        if (typeof total !== 'number' || total <= 0) {
            return NextResponse.json(
                { ok: false, erro: 'Total deve ser um número positivo.' },
                { status: 400 }
            )
        }

        // ── Emissão NFC-e ────────────────────────────────────────────
        const resultado = await emitirNFCe({
            itens: itens as ItemNFCe[],
            total: Number(total),
            formaPagamento: String(formaPagamento),
            cpfCliente: cpfCliente || undefined,
            identificadorInterno: pedidoId && typeof pedidoId === 'string' ? pedidoId : undefined,
        })

        // ── Atualiza pedido(s) com status fiscal ─────────────────────
        // Uma conta pode reunir vários pedidos sob UMA NFC-e (1 cupom por
        // cliente). Grava a mesma chave em todos os pedidos da conta.
        const ids: string[] = Array.isArray(pedidoIds)
            ? pedidoIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
            : (pedidoId && typeof pedidoId === 'string' ? [pedidoId] : [])

        if (ids.length > 0) {
            await supabase
                .from('pedidos')
                .update({
                    chave_nfce: resultado.ok ? resultado.chaveAcesso : null,
                    nfce_status: resultado.ok ? 'emitida' : 'erro',
                })
                .in('id', ids)
        }

        return NextResponse.json(resultado)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno na emissão de NFC-e.'
        return NextResponse.json(
            { ok: false, erro: message },
            { status: 500 }
        )
    }
}
