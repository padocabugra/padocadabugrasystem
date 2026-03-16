import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CaixaClient from '@/components/caixa/CaixaClient'

export const metadata = {
    title: 'PDV & Caixa | Padoca CRM',
    description: 'Ponto de Venda e controle de caixa integrado.',
}

export default async function CaixaPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Busca o usuário na tabela usuarios para obter o id interno
    const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, nome')
        .eq('email', user.email!)
        .single()

    if (!usuario) redirect('/login')

    // Início do dia corrente
    const inicioDia = new Date()
    inicioDia.setHours(0, 0, 0, 0)

    // Verifica se há abertura de caixa para o usuário no dia atual
    const { data: aberturaHoje } = await supabase
        .from('caixa')
        .select('id, valor, saldo, created_at')
        .eq('usuario_id', usuario.id)
        .eq('tipo', 'abertura')
        .gte('created_at', inicioDia.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    // Saldo atual do caixa (última movimentação do dia)
    const { data: ultimaMovimentacao } = await supabase
        .from('caixa')
        .select('saldo')
        .eq('usuario_id', usuario.id)
        .gte('created_at', inicioDia.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    // Busca pedidos com status 'pronto' para o PDV consumir
    const { data: pedidosProntos } = await supabase
        .from('pedidos')
        .select(`
            id,
            numero_mesa,
            total,
            status,
            created_at,
            cliente:clientes ( nome ),
            itens_pedido (
                id,
                quantidade,
                preco_unitario,
                subtotal,
                produto:produtos ( nome )
            )
        `)
        .eq('status', 'pronto')
        .order('created_at', { ascending: true })

    return (
        <CaixaClient
            usuarioId={usuario.id}
            usuarioNome={usuario.nome}
            aberturaHoje={aberturaHoje}
            saldoAtual={ultimaMovimentacao?.saldo ?? null}
            pedidosProntosIniciais={(pedidosProntos ?? []) as any}
        />
    )
}
