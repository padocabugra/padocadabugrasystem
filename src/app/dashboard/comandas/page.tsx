'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    CreditCard, RotateCcw, Ban, RefreshCw,
    ArrowLeft, Loader2,
} from 'lucide-react'
import Link from 'next/link'

interface Comanda {
    id: string
    numero: number
    status: 'livre' | 'ocupada' | 'bloqueada'
    updated_at: string
}

const statusConfig = {
    livre: { color: 'bg-emerald-50 border-emerald-300 text-emerald-700', label: 'Livre', dot: 'bg-emerald-500' },
    ocupada: { color: 'bg-amber-50 border-amber-300 text-amber-700', label: 'Ocupada', dot: 'bg-amber-500' },
    bloqueada: { color: 'bg-red-50 border-red-300 text-red-600', label: 'Bloqueada', dot: 'bg-red-500' },
}

export default function ComandasAdminPage() {
    const [comandas, setComandas] = useState<Comanda[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const supabase = createClient()

    const fetchComandas = useCallback(async () => {
        const { data } = await supabase
            .from('comandas')
            .select('id, numero, status, updated_at')
            .order('numero')
        setComandas(data ?? [])
        setLoading(false)
    }, [supabase])

    useEffect(() => {
        fetchComandas()
    }, [fetchComandas])

    async function handleResetar(numero: number) {
        setActionLoading(`reset-${numero}`)
        const { error } = await supabase.rpc('fn_resetar_comanda', { p_numero: numero })
        setActionLoading(null)

        if (error) {
            toast.error(`Erro ao resetar comanda ${numero}`, { description: error.message })
            return
        }
        toast.success(`Comanda ${numero} liberada!`)
        fetchComandas()
    }

    async function handleBloquear(numero: number) {
        setActionLoading(`block-${numero}`)
        const { error } = await supabase.rpc('fn_bloquear_comanda', { p_numero: numero })
        setActionLoading(null)

        if (error) {
            toast.error(`Erro ao bloquear comanda ${numero}`, { description: error.message })
            return
        }
        toast.success(`Comanda ${numero} bloqueada.`)
        fetchComandas()
    }

    async function handleResetGeral() {
        if (!confirm('Tem certeza que deseja liberar TODAS as comandas ocupadas? (Bloqueadas não serão afetadas)')) return

        setActionLoading('reset-all')
        const { error } = await supabase.rpc('fn_resetar_todas_comandas')
        setActionLoading(null)

        if (error) {
            toast.error('Erro no reset geral', { description: error.message })
            return
        }
        toast.success('Todas as comandas ocupadas foram liberadas!')
        fetchComandas()
    }

    const livres = comandas.filter(c => c.status === 'livre').length
    const ocupadas = comandas.filter(c => c.status === 'ocupada').length
    const bloqueadas = comandas.filter(c => c.status === 'bloqueada').length

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-3">
                        <Link
                            href="/dashboard/configuracoes"
                            className="p-2 rounded-xl hover:bg-gray-100 transition-colors shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-500" />
                        </Link>
                        <div className="min-w-0">
                            <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-emerald-600" />
                                Comandas
                            </h1>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Gerencie o status das comandas do estabelecimento
                            </p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleResetGeral}
                    disabled={actionLoading === 'reset-all' || ocupadas === 0}
                    className="h-11 px-5 rounded-xl bg-red-500 text-white font-semibold text-sm
                               flex items-center gap-2 hover:bg-red-600 active:scale-95 transition-all
                               disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation shrink-0 self-start sm:self-auto"
                >
                    {actionLoading === 'reset-all' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    Reset Geral (Fim do Dia)
                </button>
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-extrabold text-emerald-700">{livres}</p>
                    <p className="text-xs font-semibold text-emerald-600 mt-1">Livres</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-extrabold text-amber-700">{ocupadas}</p>
                    <p className="text-xs font-semibold text-amber-600 mt-1">Ocupadas</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                    <p className="text-2xl font-extrabold text-red-600">{bloqueadas}</p>
                    <p className="text-xs font-semibold text-red-500 mt-1">Bloqueadas</p>
                </div>
            </div>

            {/* Grid de Comandas */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    Carregando comandas...
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {comandas.map((comanda) => {
                        const config = statusConfig[comanda.status]
                        const isLoading = actionLoading === `reset-${comanda.numero}` || actionLoading === `block-${comanda.numero}`

                        return (
                            <div
                                key={comanda.id}
                                className={`rounded-2xl border-2 p-4 ${config.color} transition-all`}
                            >
                                {/* Número + Status */}
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-2xl font-extrabold">{comanda.numero}</span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                                        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                                        {config.label}
                                    </span>
                                </div>

                                {/* Ações */}
                                <div className="flex gap-1.5">
                                    {comanda.status !== 'livre' && (
                                        <button
                                            onClick={() => handleResetar(comanda.numero)}
                                            disabled={isLoading}
                                            className="flex-1 py-2 rounded-xl bg-white/80 border border-current/20
                                                       text-xs font-bold flex items-center justify-center gap-1
                                                       hover:bg-white active:scale-95 transition-all
                                                       disabled:opacity-50 touch-manipulation"
                                        >
                                            {actionLoading === `reset-${comanda.numero}` ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <RotateCcw className="w-3 h-3" />
                                            )}
                                            Liberar
                                        </button>
                                    )}
                                    {comanda.status !== 'bloqueada' && (
                                        <button
                                            onClick={() => handleBloquear(comanda.numero)}
                                            disabled={isLoading}
                                            className="flex-1 py-2 rounded-xl bg-white/80 border border-current/20
                                                       text-xs font-bold flex items-center justify-center gap-1
                                                       hover:bg-white active:scale-95 transition-all
                                                       disabled:opacity-50 touch-manipulation"
                                        >
                                            {actionLoading === `block-${comanda.numero}` ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Ban className="w-3 h-3" />
                                            )}
                                            Bloquear
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
