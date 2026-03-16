import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PainelCozinhaClient, { type PedidoCozinha } from '@/components/cozinha/PainelCozinhaClient'
import { getInicioDoDia } from '@/lib/timezone'

// Server Component: busca estado inicial dos pedidos do dia e passa para o Client
export default async function CozinhaPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Início do dia corrente (Timezone America/Campo_Grande)
    const inicioDia = getInicioDoDia()

    // Busca pedidos do dia que ainda estão no fluxo de produção
    const { data: pedidosRaw } = await supabase
        .from('pedidos')
        .select(`
            id,
            numero_mesa,
            total,
            status,
            tipo_pedido,
            created_at,
            itens_pedido (
                quantidade,
                produto_id,
                produtos ( nome )
            )
        `)
        .gte('created_at', inicioDia)
        .not('status', 'in', '("entregue","cancelado")')
        .order('created_at', { ascending: false })

    // Mapeia para o tipo PedidoCozinha
    const pedidos: PedidoCozinha[] = (pedidosRaw ?? []).map((p: any) => ({
        id: p.id,
        numero_mesa: p.numero_mesa,
        total: p.total,
        status: p.status,
        tipo_pedido: p.tipo_pedido || 'local',
        created_at: p.created_at,
        itens: (p.itens_pedido ?? []).map((i: any) => ({
            quantidade: i.quantidade,
            produto_nome: i.produtos?.nome ?? 'Produto',
            produto_id: i.produto_id,
        })),
    }))

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Top Bar */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Painel da Cozinha</h1>
                    <p className="text-sm text-gray-500">Atualização em tempo real via Supabase Realtime.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 hidden sm:block">
                        Pressione <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono font-bold">?</kbd> para atalhos
                    </span>
                    <span className="flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-50
                                      border border-emerald-200 px-3 py-1.5 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Ao Vivo
                    </span>
                </div>
            </div>

            {/* Kanban — Client Component com Realtime */}
            <PainelCozinhaClient pedidosIniciais={pedidos} />
        </div>
    )
}
