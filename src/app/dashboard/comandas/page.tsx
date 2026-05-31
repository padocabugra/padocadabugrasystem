'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    CreditCard, RotateCcw, Ban, RefreshCw,
    ArrowLeft, Loader2, AlertTriangle, Plus, Search,
} from 'lucide-react'
import Link from 'next/link'

interface Comanda {
    id: string
    numero: number
    status: 'livre' | 'consumo' | 'bloqueada'
    updated_at: string
}

const statusConfig: Record<Comanda['status'], { color: string; label: string; dot: string }> = {
    livre: { color: 'bg-emerald-50 border-emerald-300 text-emerald-700', label: 'Livre', dot: 'bg-emerald-500' },
    consumo: { color: 'bg-amber-50 border-amber-300 text-amber-700', label: 'Em consumo', dot: 'bg-amber-500' },
    bloqueada: { color: 'bg-red-50 border-red-300 text-red-600', label: 'Bloqueada', dot: 'bg-red-500' },
}

const FALLBACK_CONFIG = { color: 'bg-gray-50 border-gray-300 text-gray-600', label: 'Desconhecido', dot: 'bg-gray-400' }

export default function ComandasAdminPage() {
    const [comandas, setComandas] = useState<Comanda[]>([])
    const [loading, setLoading] = useState(true)
    const [fetchError, setFetchError] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    // Filtro de visualização (evita despejar 100 comandas de uma vez) + busca por número
    const [filtro, setFiltro] = useState<Comanda['status']>('consumo')
    const [busca, setBusca] = useState('')
    const supabase = createClient()

    const fetchComandas = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('comandas')
                .select('id, numero, status, updated_at')
                .order('numero')

            if (error) {
                console.error('[COMANDAS] Falha ao buscar:', error)
                setFetchError(error.message || 'Erro ao carregar comandas.')
                setComandas([])
            } else {
                setComandas(data ?? [])
                setFetchError(null)
            }
        } catch (err) {
            console.error('[COMANDAS] Exceção inesperada:', err)
            setFetchError(err instanceof Error ? err.message : 'Erro desconhecido ao carregar comandas.')
            setComandas([])
        } finally {
            setLoading(false)
        }
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
    const ocupadas = comandas.filter(c => c.status === 'consumo').length
    const bloqueadas = comandas.filter(c => c.status === 'bloqueada').length

    const buscaNum = busca.trim()
    const comandasFiltradas = comandas.filter(c =>
        c.status === filtro && (buscaNum === '' || String(c.numero).includes(buscaNum))
    )

    // Adiciona uma nova comanda com o próximo número (amplia o pool de comandas)
    async function handleAdicionarComanda() {
        const proximo = comandas.reduce((max, c) => Math.max(max, c.numero), 0) + 1
        setActionLoading('add')
        const { error } = await supabase.from('comandas').insert({ numero: proximo, status: 'livre' })
        setActionLoading(null)
        if (error) {
            toast.error('Erro ao adicionar comanda', { description: error.message })
            return
        }
        toast.success(`Comanda ${proximo} adicionada!`)
        fetchComandas()
    }

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
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <button
                        onClick={handleAdicionarComanda}
                        disabled={actionLoading === 'add'}
                        className="h-11 px-5 rounded-xl bg-emerald-600 text-white font-semibold text-sm
                                   flex items-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all
                                   disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                    >
                        {actionLoading === 'add' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Plus className="w-4 h-4" />
                        )}
                        Adicionar Comanda
                    </button>
                    <button
                        onClick={handleResetGeral}
                        disabled={actionLoading === 'reset-all' || ocupadas === 0}
                        className="h-11 px-5 rounded-xl bg-red-500 text-white font-semibold text-sm
                                   flex items-center gap-2 hover:bg-red-600 active:scale-95 transition-all
                                   disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                    >
                        {actionLoading === 'reset-all' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        Reset Geral (Fim do Dia)
                    </button>
                </div>
            </div>

            {/* Resumo = filtros clicáveis (evita mostrar as 100 de uma vez) */}
            <div className="grid grid-cols-3 gap-3">
                <button
                    onClick={() => setFiltro('consumo')}
                    className={`rounded-2xl border-2 p-4 text-center transition-all ${filtro === 'consumo' ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-200' : 'bg-amber-50 border-amber-200 hover:border-amber-300'}`}
                >
                    <p className="text-2xl font-extrabold text-amber-700">{ocupadas}</p>
                    <p className="text-xs font-semibold text-amber-600 mt-1">Abertas (em uso)</p>
                </button>
                <button
                    onClick={() => setFiltro('livre')}
                    className={`rounded-2xl border-2 p-4 text-center transition-all ${filtro === 'livre' ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-200' : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'}`}
                >
                    <p className="text-2xl font-extrabold text-emerald-700">{livres}</p>
                    <p className="text-xs font-semibold text-emerald-600 mt-1">Disponíveis</p>
                </button>
                <button
                    onClick={() => setFiltro('bloqueada')}
                    className={`rounded-2xl border-2 p-4 text-center transition-all ${filtro === 'bloqueada' ? 'bg-red-100 border-red-400 ring-2 ring-red-200' : 'bg-red-50 border-red-200 hover:border-red-300'}`}
                >
                    <p className="text-2xl font-extrabold text-red-600">{bloqueadas}</p>
                    <p className="text-xs font-semibold text-red-500 mt-1">Bloqueadas</p>
                </button>
            </div>

            {/* Busca por número + rótulo do filtro ativo */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="number"
                        inputMode="numeric"
                        placeholder="Buscar comanda pelo número..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </div>
                <span className="text-xs text-gray-400">
                    {comandasFiltradas.length} {filtro === 'consumo' ? 'em uso' : filtro === 'livre' ? 'disponíveis' : 'bloqueadas'}
                </span>
            </div>

            {/* Grid de Comandas (somente o filtro ativo) */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    Carregando comandas...
                </div>
            ) : fetchError ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-amber-50 border border-amber-200 rounded-2xl">
                    <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
                    <p className="text-sm font-bold text-gray-800">Não foi possível carregar as comandas</p>
                    <p className="text-xs text-gray-600 mt-1 max-w-md break-words">{fetchError}</p>
                    <button
                        onClick={() => { setLoading(true); fetchComandas() }}
                        className="mt-4 h-10 px-4 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Tentar Novamente
                    </button>
                </div>
            ) : comandasFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <CreditCard className="w-10 h-10 mb-3 text-gray-300" />
                    <p className="text-sm font-medium">
                        {buscaNum !== ''
                            ? `Nenhuma comanda ${buscaNum} ${filtro === 'consumo' ? 'em uso' : filtro === 'livre' ? 'disponível' : 'bloqueada'}.`
                            : filtro === 'consumo'
                                ? 'Nenhuma comanda em uso no momento.'
                                : filtro === 'livre'
                                    ? 'Nenhuma comanda disponível.'
                                    : 'Nenhuma comanda bloqueada.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {comandasFiltradas.map((comanda) => {
                        const config = statusConfig[comanda.status] ?? FALLBACK_CONFIG
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
