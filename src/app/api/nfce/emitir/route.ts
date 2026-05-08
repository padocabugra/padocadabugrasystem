import { NextResponse } from 'next/server'
import { emitirNFCe, type ItemNFCe } from '@/lib/brasilnfe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { pedidoId, itens, total, formaPagamento, cpfCliente } = body ?? {}

        if (!Array.isArray(itens) || itens.length === 0 || !total || !formaPagamento) {
            return NextResponse.json(
                { ok: false, erro: 'Dados inválidos: itens, total e formaPagamento são obrigatórios.' },
                { status: 400 }
            )
        }

        const resultado = await emitirNFCe({
            itens: itens as ItemNFCe[],
            total: Number(total),
            formaPagamento: String(formaPagamento),
            cpfCliente: cpfCliente || undefined,
        })

        if (pedidoId) {
            const supabase = await createClient()
            await supabase
                .from('pedidos')
                .update({
                    chave_nfce: resultado.ok ? resultado.chaveAcesso : null,
                    nfce_status: resultado.ok ? 'emitida' : 'erro',
                })
                .eq('id', pedidoId)
        }

        return NextResponse.json(resultado)
    } catch (err: any) {
        return NextResponse.json(
            { ok: false, erro: err?.message ?? 'Erro interno na emissão de NFC-e.' },
            { status: 500 }
        )
    }
}
