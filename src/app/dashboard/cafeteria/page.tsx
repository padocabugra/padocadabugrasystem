import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PainelCafeteriaClient from '@/components/cafeteria/PainelCafeteriaClient'
import type { PedidoProducao, ProdutoQuickAdd } from '@/components/producao/PainelProducaoKanban'
import { getInicioDoDia } from '@/lib/timezone'

// Server Component: busca a fila inicial da Cafeteria + catálogo p/ o quick-add.
export default async function CafeteriaPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // id interno do usuário (vendedor) — usado no quick-add
    const { data: usuario } = await supabase
        .from('usuarios')
        .select('id')
        .eq('id', user.id)
        .single()

    if (!usuario) redirect('/login')

    const inicioDia = getInicioDoDia()

    // Pedidos do dia que ainda estão na fila da Cafeteria
    const { data: pedidosRaw } = await supabase
        .from('pedidos')
        .select(`
            id,
            numero_mesa,
            total,
            status,
            tipo_pedido,
            created_at,
            comanda:comandas!pedidos_comanda_id_fkey ( numero ),
            itens_pedido (
                quantidade,
                produto_id,
                produtos ( nome )
            )
        `)
        .gte('created_at', inicioDia)
        .eq('destino_cafeteria', true)
        .eq('retirado_cafeteria', false)
        .not('status', 'in', '("entregue","cancelado")')
        .order('created_at', { ascending: false })

    const pedidos: PedidoProducao[] = (pedidosRaw ?? []).map((p: any) => ({
        id: p.id,
        numero_mesa: p.numero_mesa,
        comanda_numero: Array.isArray(p.comanda) ? (p.comanda[0]?.numero ?? null) : (p.comanda?.numero ?? null),
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

    // Catálogo enxuto p/ o quick-add (1 item direto no painel)
    const { data: produtosRaw } = await supabase
        .from('produtos')
        .select('id, nome, preco, unidade_medida, categoria')
        .eq('ativo', true)
        .eq('disponivel_venda', true)
        .order('categoria', { ascending: true })
        .order('nome', { ascending: true })

    const produtos: ProdutoQuickAdd[] = (produtosRaw ?? []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        preco: Number(p.preco),
        unidade_medida: p.unidade_medida,
        categoria: p.categoria,
    }))

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Top Bar — tema âmbar/café p/ não confundir com a Cozinha */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900">Painel da Cafeteria</h1>
                    <p className="text-sm text-gray-500">Atualização em tempo real via Supabase Realtime.</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-gray-400 hidden sm:block">
                        Pressione <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono font-bold">?</kbd> para atalhos
                    </span>
                    <span className="flex items-center gap-2 text-xs font-semibold text-amber-600 bg-amber-50
                                      border border-amber-200 px-3 py-1.5 rounded-full">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        Ao Vivo
                    </span>
                </div>
            </div>

            {/* Kanban — Client Component com Realtime + quick-add */}
            <PainelCafeteriaClient
                pedidosIniciais={pedidos}
                vendedorId={usuario.id}
                produtos={produtos}
            />
        </div>
    )
}
