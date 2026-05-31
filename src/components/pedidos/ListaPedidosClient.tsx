'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, Clock, CheckCircle2, ChevronRight, Bell, Truck, MapPin, Activity, XCircle, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import PedidoDetalheModal from './PedidoDetalheModal'

type FiltroStatus = 'andamento' | 'entregue' | 'cancelado'

const STATUS_DE: Record<FiltroStatus, string[]> = {
    andamento: ['pendente', 'preparando', 'pronto'],
    entregue: ['entregue'],
    cancelado: ['cancelado'],
}

const SELECT_PEDIDO =
    'id, numero_mesa, comanda_id, total, status, tipo_pedido, forma_pagamento, created_at, cliente:clientes(nome), comanda:comandas!pedidos_comanda_id_fkey(numero)'

interface ListaPedidosClientProps {
    pedidosIniciais: any[]
}

const statusConfig: Record<string, { color: string; label: string; icon: any }> = {
    pendente: { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Pendente', icon: Clock },
    preparando: { color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Preparando', icon: Bell },
    pronto: { color: 'bg-green-100 text-green-700 border-green-200', label: 'Pronto', icon: CheckCircle2 },
    entregue: { color: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Entregue', icon: CheckCircle2 },
    cancelado: { color: 'bg-red-100 text-red-600 border-red-200', label: 'Cancelado', icon: XCircle },
}

export default function ListaPedidosClient({ pedidosIniciais }: ListaPedidosClientProps) {
    const [filtro, setFiltro] = useState<FiltroStatus>('andamento')
    const [pedidos, setPedidos] = useState<any[]>(pedidosIniciais)
    const [loading, setLoading] = useState(false)
    const [detalheId, setDetalheId] = useState<string | null>(null)
    const supabase = createClient()

    const carregar = useCallback(async (f: FiltroStatus) => {
        setLoading(true)
        let q = supabase
            .from('pedidos')
            .select(SELECT_PEDIDO)
            .in('status', STATUS_DE[f])
            .order('created_at', { ascending: false })
            .limit(f === 'andamento' ? 100 : 25)
        const { data } = await q
        setPedidos(data ?? [])
        setLoading(false)
    }, [supabase])

    useEffect(() => { carregar(filtro) }, [filtro, carregar])

    // Realtime: recarrega o filtro atual a qualquer mudança em pedidos (discreto).
    const carregarRef = useRef(carregar)
    const filtroRef = useRef(filtro)
    useEffect(() => { carregarRef.current = carregar; filtroRef.current = filtro }, [carregar, filtro])
    useEffect(() => {
        const ch = supabase
            .channel('pedidos_lista_rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' },
                () => { void carregarRef.current(filtroRef.current) })
            .subscribe()
        return () => { supabase.removeChannel(ch) }
    }, [supabase])

    const TABS: { value: FiltroStatus; label: string; icon: any; bg: string; bgActive: string; text: string }[] = [
        { value: 'andamento', label: 'Em Andamento', icon: Activity, bg: 'bg-blue-50', bgActive: 'bg-blue-200', text: 'text-blue-800' },
        { value: 'entregue', label: 'Entregues', icon: CheckCircle2, bg: 'bg-emerald-50', bgActive: 'bg-emerald-200', text: 'text-emerald-800' },
        { value: 'cancelado', label: 'Cancelados', icon: XCircle, bg: 'bg-red-50', bgActive: 'bg-red-200', text: 'text-red-800' },
    ]

    return (
        <div className="flex flex-col gap-3">
            {/* Filtro por status */}
            <div className="flex items-center gap-2 flex-wrap">
                {TABS.map((t) => {
                    const isActive = filtro === t.value
                    const Icon = t.icon
                    return (
                        <button
                            key={t.value}
                            onClick={() => setFiltro(t.value)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-200
                                ${isActive ? `${t.bgActive} ${t.text} font-bold shadow-sm` : `${t.bg} ${t.text} font-medium opacity-80 hover:opacity-100`}`}
                        >
                            <Icon className="w-3 h-3" />
                            {t.label}
                        </button>
                    )
                })}
                {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin ml-1" />}
            </div>

            {/* Aviso de limite pra histórico */}
            {filtro !== 'andamento' && (
                <p className="text-xs text-gray-400">
                    Mostrando os últimos 25 {filtro === 'entregue' ? 'entregues' : 'cancelados'}. Para o relatório completo do dia, use o Fechamento de Caixa.
                </p>
            )}

            {pedidos.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 py-20 bg-white rounded-3xl border border-blue-50">
                    <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
                        <ClipboardList className="w-10 h-10 text-slate-400" />
                    </div>
                    <div className="text-center">
                        <p className="text-base font-bold text-slate-700">
                            {filtro === 'andamento' ? 'Nenhum pedido em andamento.' : filtro === 'entregue' ? 'Nenhum pedido entregue ainda.' : 'Nenhum pedido cancelado.'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">A lista atualiza em tempo real.</p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-3">
                    {pedidos.map((pedido) => {
                        const clienteNome = pedido.cliente?.nome ?? 'Cliente Balcão'
                        const config = statusConfig[pedido.status] ?? statusConfig.pendente
                        const Icon = config.icon
                        const isDelivery = (pedido.tipo_pedido || 'local') === 'delivery'

                        return (
                            <button
                                key={pedido.id}
                                onClick={() => setDetalheId(pedido.id)}
                                className={`w-full text-left flex items-center gap-2 sm:gap-4 bg-white rounded-2xl border px-3 sm:px-5 py-3 sm:py-4 shadow-sm transition-all
                                           hover:border-primary/40 hover:shadow-md active:scale-[0.99]
                                           ${pedido.status === 'pronto' ? 'border-green-300 ring-2 ring-green-100' : ''}
                                           ${isDelivery ? 'border-l-4 border-l-[#054F77] border-blue-100' : 'border-blue-100'}`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-gray-900 truncate">{clienteNome}</p>
                                    </div>
                                    <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                                        {isDelivery ? (
                                            <span className="font-black text-primary flex items-center gap-1">
                                                <Truck className="w-3 h-3" /> DELIVERY
                                            </span>
                                        ) : (
                                            <span className={`font-black flex items-center gap-1 ${pedido.numero_mesa ? 'text-primary' : 'text-gray-400'}`}>
                                                <MapPin className="w-3 h-3" />
                                                {pedido.numero_mesa ? `MESA ${pedido.numero_mesa}` : 'BALCÃO'}
                                            </span>
                                        )}
                                        {pedido.comanda?.numero != null && (
                                            <>
                                                <span>·</span>
                                                <span className="font-bold text-emerald-600">CMD {pedido.comanda.numero}</span>
                                            </>
                                        )}
                                        <span>·</span>
                                        <span>{new Date(pedido.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                                    </p>
                                </div>

                                <div className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wider shrink-0 ${config.color}`}>
                                    <Icon className="w-3 h-3" />
                                    {config.label}
                                </div>

                                <p className="text-sm sm:text-base font-black text-primary shrink-0 ml-1 sm:ml-2">
                                    {formatCurrency(Number(pedido.total))}
                                </p>

                                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                            </button>
                        )
                    })}
                </div>
            )}

            {detalheId && (
                <PedidoDetalheModal
                    pedidoId={detalheId}
                    onClose={() => setDetalheId(null)}
                    onChanged={() => carregar(filtro)}
                />
            )}
        </div>
    )
}
