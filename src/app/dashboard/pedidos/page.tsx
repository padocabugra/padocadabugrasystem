import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlusCircle, Truck, Zap } from 'lucide-react'
import ListaPedidosClient from '@/components/pedidos/ListaPedidosClient'

interface PedidosPageProps {
    searchParams: Promise<{ tipo?: string }>
}

export default async function PedidosPage({ searchParams }: PedidosPageProps) {
    const supabase = await createClient()
    const params = await searchParams

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const isDeliveryView = params.tipo === 'delivery'

    // Estado inicial = pedidos EM ANDAMENTO (o filtro padrão do client). Histórico
    // (entregues/cancelados) é carregado sob demanda pelo próprio client.
    const { data: pedidos } = await supabase
        .from('pedidos')
        .select('id, numero_mesa, comanda_id, total, status, tipo_pedido, forma_pagamento, created_at, cliente:clientes(nome), comanda:comandas!pedidos_comanda_id_fkey(numero)')
        .in('status', ['pendente', 'preparando', 'pronto'])
        .order('created_at', { ascending: false })
        .limit(100)

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
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
                <div className="flex items-center gap-2 flex-wrap">
                    {!isDeliveryView && (
                        <Link
                            href="/dashboard/pdv"
                            className="h-14 px-4 sm:px-5 rounded-xl font-bold flex items-center gap-2 text-sm
                                       bg-emerald-500 hover:bg-emerald-600 text-white
                                       shadow-lg shadow-emerald-500/30
                                       active:scale-95 transition-all touch-manipulation"
                        >
                            <Zap className="w-4 h-4 fill-white" />
                            Venda Rápida
                        </Link>
                    )}
                    <Link
                        href={`/dashboard/pedidos/novo${isDeliveryView ? '?tipo=delivery' : ''}`}
                        className={`h-14 px-4 sm:px-5 rounded-xl font-semibold flex items-center gap-2 text-sm
                                    active:scale-95 transition-all touch-manipulation ${isDeliveryView
                                ? 'bg-[#054F77] hover:bg-[#054F77]/90 text-white'
                                : 'bg-primary text-white hover:bg-primary/90'
                            }`}
                    >
                        <PlusCircle className="w-4 h-4" />
                        {isDeliveryView ? 'Novo Delivery' : 'Novo Pedido'}
                    </Link>
                </div>
            </div>

            {/* Listagem com Real-time */}
            <ListaPedidosClient pedidosIniciais={pedidos ?? []} />
        </div>
    )
}
