import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlusCircle, Truck } from 'lucide-react'
import ListaPedidosClient from '@/components/pedidos/ListaPedidosClient'

interface PedidosPageProps {
    searchParams: Promise<{ tipo?: string }>
}

export default async function PedidosPage({ searchParams }: PedidosPageProps) {
    const supabase = await createClient()
    const params = await searchParams

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const filtroTipo = params.tipo === 'delivery' ? 'delivery' : 'todos'
    const isDeliveryView = filtroTipo === 'delivery'

    let query = supabase
        .from('pedidos')
        .select('id, numero_mesa, total, status, tipo_pedido, created_at, cliente:clientes(nome)')
        .order('created_at', { ascending: false })
        .limit(50)

    if (isDeliveryView) {
        query = query.eq('tipo_pedido', 'delivery')
    }

    const { data: pedidos } = await query

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        {isDeliveryView && <Truck className="w-5 h-5 text-primary" />}
                        {isDeliveryView ? 'Pedidos Delivery' : 'Pedidos'}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {isDeliveryView
                            ? 'Pedidos para entrega — destacados na cozinha.'
                            : 'Acompanhe seus pedidos em tempo real.'}
                    </p>
                </div>
                <Link
                    href={`/dashboard/pedidos/novo${isDeliveryView ? '?tipo=delivery' : ''}`}
                    className={`h-11 px-5 rounded-xl font-semibold flex items-center gap-2 text-sm
                                active:scale-95 transition-all touch-manipulation ${isDeliveryView
                            ? 'bg-[#054F77] hover:bg-[#054F77]/90 text-white'
                            : 'bg-primary text-white hover:bg-primary/90'
                        }`}
                >
                    <PlusCircle className="w-4 h-4" />
                    {isDeliveryView ? 'Novo Delivery' : 'Novo Pedido'}
                </Link>
            </div>

            {/* Listagem com Real-time */}
            <ListaPedidosClient
                pedidosIniciais={pedidos ?? []}
                filtroTipoInicial={filtroTipo as any}
            />
        </div>
    )
}
