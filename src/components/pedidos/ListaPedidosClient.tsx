'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, Clock, CheckCircle2, ChevronRight, Bell, Truck, MapPin, Filter } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import type { TipoPedido } from '@/lib/types/pedidos'
import { toast } from 'sonner'

interface ListaPedidosClientProps {
    pedidosIniciais: any[]
    filtroTipoInicial?: TipoPedido | 'todos'
}

export default function ListaPedidosClient({ pedidosIniciais, filtroTipoInicial = 'todos' }: ListaPedidosClientProps) {
    const [pedidos, setPedidos] = useState(pedidosIniciais)
    const [filtroTipo, setFiltroTipo] = useState<TipoPedido | 'todos'>(filtroTipoInicial)
    const supabase = createClient()

    useEffect(() => {
        const channel = supabase
            .channel('pedidos_waiter_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'pedidos' },
                async (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const { data: cliente } = await supabase
                            .from('clientes')
                            .select('nome')
                            .eq('id', payload.new.cliente_id)
                            .maybeSingle()

                        const novoPedido = {
                            ...payload.new,
                            cliente: cliente || { nome: 'Cliente Balcão' }
                        }
                        setPedidos((prev) => [novoPedido, ...prev])

                        const tipoLabel = payload.new.tipo_pedido === 'delivery' ? ' - Delivery' : ''
                        toast.info(`Novo pedido recebido! ${tipoLabel}`)
                    } else if (payload.eventType === 'UPDATE') {
                        setPedidos((prev) =>
                            prev.map((p) => (p.id === payload.new.id ? { ...p, ...payload.new } : p))
                        )

                        if (payload.new.status === 'pronto' && payload.old.status !== 'pronto') {
                            toast.success(`Pedido da Mesa ${payload.new.numero_mesa || 'Balcão'} está PRONTO!`, {
                                duration: 10000,
                                position: 'top-center'
                            })
                        }
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase])

    const pedidosFiltrados = useMemo(() => {
        if (filtroTipo === 'todos') return pedidos
        return pedidos.filter(p => (p.tipo_pedido || 'local') === filtroTipo)
    }, [pedidos, filtroTipo])

    const statusConfig: Record<string, { color: string; label: string; icon: any }> = {
        pendente: { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Pendente', icon: Clock },
        preparando: { color: 'bg-blue-50 text-blue-700 border-blue-100', label: 'Preparando', icon: Bell },
        pronto: { color: 'bg-green-100 text-green-700 border-green-200', label: 'Pronto', icon: CheckCircle2 },
        entregue: { color: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Entregue', icon: CheckCircle2 },
        cancelado: { color: 'bg-red-100 text-red-600 border-red-200', label: 'Cancelado', icon: ChevronRight },
    }

    return (
        <div className="flex flex-col gap-3">
            {/* Filtro por tipo */}
            <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                {([
                    { value: 'todos' as const, label: 'Todos', icon: null },
                    { value: 'local' as const, label: 'Local', icon: MapPin },
                    { value: 'delivery' as const, label: 'Delivery', icon: Truck },
                ]).map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setFiltroTipo(f.value)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${filtroTipo === f.value
                                ? f.value === 'delivery'
                                    ? 'bg-[#054F77] border-[#054F77] text-white'
                                    : 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                            }`}
                    >
                        {f.icon && <f.icon className="w-3 h-3" />}
                        {f.label}
                    </button>
                ))}
                <span className="text-xs text-gray-400 ml-2">
                    {pedidosFiltrados.length} pedido{pedidosFiltrados.length !== 1 ? 's' : ''}
                </span>
            </div>

            {!pedidosFiltrados || pedidosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400 bg-white rounded-3xl border border-blue-50">
                    <ClipboardList className="w-12 h-12 opacity-30" />
                    <p className="text-sm">Nenhum pedido registrado ainda.</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {pedidosFiltrados.map((pedido) => {
                        const clienteNome = pedido.cliente?.nome ?? 'Cliente Balcão'
                        const config = statusConfig[pedido.status] ?? statusConfig.pendente
                        const Icon = config.icon
                        const isDelivery = (pedido.tipo_pedido || 'local') === 'delivery'

                        return (
                            <div
                                key={pedido.id}
                                className={`flex items-center gap-4 bg-white rounded-2xl border px-5 py-4 shadow-sm transition-all
                                           ${pedido.status === 'pronto' ? 'border-green-300 ring-2 ring-green-100 animate-pulse-subtle' : ''}
                                           ${isDelivery ? 'border-l-4 border-l-[#054F77] border-blue-100' : 'border-blue-100'}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-gray-900 truncate">{clienteNome}</p>
                                        {pedido.status === 'pronto' && (
                                            <span className="flex h-2 w-2 rounded-full bg-green-500 animate-ping" />
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                                        {isDelivery ? (
                                            <span className="font-black text-primary flex items-center gap-1">
                                                <Truck className="w-3 h-3" />
                                                DELIVERY
                                            </span>
                                        ) : (
                                            <span className={`font-black ${pedido.numero_mesa ? 'text-primary' : 'text-gray-400'}`}>
                                                {pedido.numero_mesa ? `MESA ${pedido.numero_mesa}` : 'BALCÃO'}
                                            </span>
                                        )}
                                        ·
                                        <span>
                                            {new Date(pedido.created_at).toLocaleTimeString('pt-BR', {
                                                hour: '2-digit', minute: '2-digit'
                                            })}
                                        </span>
                                    </p>
                                </div>

                                {/* Badge Delivery */}
                                {isDelivery && (
                                    <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-primary rounded-full text-[10px] font-black uppercase tracking-wider border border-blue-200">
                                        <Truck className="w-3 h-3" />
                                        Delivery
                                    </span>
                                )}

                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${config.color}`}>
                                    <Icon className="w-3 h-3" />
                                    {config.label}
                                </div>

                                <p className="text-base font-black text-primary shrink-0 ml-2">
                                    {formatCurrency(Number(pedido.total))}
                                </p>

                                <div className="p-2 bg-gray-50 rounded-lg text-gray-400 lg:hidden">
                                    <ChevronRight className="w-4 h-4" />
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
