'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    ScrollText, Search, Filter, RefreshCw, Clock,
    Shield, Package, ShoppingCart, User, FileText,
} from 'lucide-react'
import Paginacao, { usePaginacao } from '@/components/shared/Paginacao'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
    id: string
    usuario_id: string | null
    usuario_nome: string | null
    acao: string
    entidade: string
    entidade_id: string | null
    detalhes: Record<string, unknown>
    created_at: string
}

type FiltroEntidade = 'todos' | 'caixa' | 'produtos' | 'usuarios' | 'pedidos'

const ENTIDADE_OPTIONS: { value: FiltroEntidade; label: string; icon: React.ElementType }[] = [
    { value: 'todos', label: 'Todos', icon: ScrollText },
    { value: 'caixa', label: 'Caixa', icon: ShoppingCart },
    { value: 'produtos', label: 'Estoque', icon: Package },
    { value: 'usuarios', label: 'Usuários', icon: User },
    { value: 'pedidos', label: 'Vendas', icon: FileText },
]

function getAcaoColor(acao: string): string {
    if (acao.includes('criar') || acao.includes('abertura') || acao.includes('entrada') || acao.includes('ativar'))
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (acao.includes('desativar') || acao.includes('saida') || acao.includes('sangria') || acao.includes('deletar'))
        return 'bg-red-50 text-red-700 border-red-200'
    if (acao.includes('venda') || acao.includes('reforco'))
        return 'bg-blue-50 text-blue-700 border-blue-200'
    return 'bg-gray-50 text-gray-600 border-gray-200'
}

function formatarData(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
    })
}

// ── Componente Principal ─────────────────────────────────────────────────────

export default function AuditLogPage() {
    const [logs, setLogs] = useState<AuditEntry[]>([])
    // Mapa usuario_id → nome, populado por query separada (audit_log não tem FK
    // direta pra public.usuarios — ambos referenciam auth.users — então o embed
    // do PostgREST falha; resolvemos em duas queries).
    const [usuarioMap, setUsuarioMap] = useState<Map<string, string>>(new Map())
    const [loading, setLoading] = useState(true)
    const [busca, setBusca] = useState('')
    const [filtro, setFiltro] = useState<FiltroEntidade>('todos')
    const [pagina, setPagina] = useState(1)
    const supabase = createClient()

    const fetchLogs = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('audit_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500)

            if (error) {
                console.error('[AUDIT_LOG] fetch error:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
                // Caso típico: tabela não criada no Supabase (migration 011 não aplicada).
                // PGRST205 = "Could not find the table ... in the schema cache".
                const msg = (error as any)?.code === 'PGRST205'
                    ? 'Tabela audit_log não existe no banco. Aplique migrations/011_create_audit_log.sql no Supabase.'
                    : (error.message || 'Falha ao carregar logs')
                toast.error(msg, {
                    description: error.hint || error.details || undefined,
                    duration: 8000,
                })
                setLogs([])
                return
            }

            const lista = (data ?? []) as AuditEntry[]
            setLogs(lista)

            // Resolve nomes que não foram persistidos no momento da inserção.
            // Coleta uuids únicos cujo usuario_nome está vazio.
            const idsParaResolver = Array.from(new Set(
                lista
                    .filter((l) => !l.usuario_nome && l.usuario_id)
                    .map((l) => l.usuario_id as string)
            ))

            if (idsParaResolver.length > 0) {
                const { data: usuariosData, error: usuariosErr } = await supabase
                    .from('usuarios')
                    .select('id, nome')
                    .in('id', idsParaResolver)

                if (usuariosErr) {
                    console.error('[AUDIT_LOG] enrich error:', {
                        message: usuariosErr.message,
                        code: usuariosErr.code,
                        details: usuariosErr.details,
                        hint: usuariosErr.hint,
                    })
                } else {
                    const map = new Map<string, string>()
                    for (const u of (usuariosData ?? []) as Array<{ id: string; nome: string }>) {
                        map.set(u.id, u.nome)
                    }
                    setUsuarioMap(map)
                }
            } else {
                setUsuarioMap(new Map())
            }
        } catch (err) {
            console.error('[AUDIT_LOG] exception:', err)
            toast.error('Falha inesperada ao carregar logs')
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => { fetchLogs() }, [fetchLogs])

    // Filtro composto
    const logsFiltrados = logs.filter((log) => {
        const matchFiltro = filtro === 'todos' || log.entidade === filtro
        if (!busca) return matchFiltro
        const termo = busca.toLowerCase()
        const matchBusca =
            log.acao.toLowerCase().includes(termo) ||
            (log.usuario_nome ?? '').toLowerCase().includes(termo) ||
            (log.entidade_id ?? '').toLowerCase().includes(termo) ||
            JSON.stringify(log.detalhes).toLowerCase().includes(termo)
        return matchFiltro && matchBusca
    })

    const { paginar, totalPaginas, totalItens, itensPorPagina } = usePaginacao(logsFiltrados, 20)
    const logsPaginados = paginar(pagina)

    function handleBusca(valor: string) {
        setBusca(valor)
        setPagina(1)
    }
    function handleFiltro(f: FiltroEntidade) {
        setFiltro(f)
        setPagina(1)
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-600" />
                        Audit Log
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Registro imutável de operações sensíveis do sistema
                    </p>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-all"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por ação, usuário ou detalhes..."
                        value={busca}
                        onChange={(e) => handleBusca(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    {ENTIDADE_OPTIONS.map((opt) => {
                        const Icon = opt.icon
                        return (
                            <button
                                key={opt.value}
                                onClick={() => handleFiltro(opt.value)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                    filtro === opt.value
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                {opt.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Tabela */}
            {loading ? (
                <div className="flex justify-center p-16">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : logsFiltrados.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 flex flex-col items-center text-gray-400">
                    <ScrollText className="w-12 h-12 mb-3 opacity-20" />
                    <p className="font-medium">Nenhum registro encontrado</p>
                    <p className="text-sm mt-1">Operações sensíveis aparecerão aqui automaticamente.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/80 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Data/Hora</th>
                                    <th className="px-4 py-3 font-semibold">Usuário</th>
                                    <th className="px-4 py-3 font-semibold">Ação</th>
                                    <th className="px-4 py-3 font-semibold">Entidade</th>
                                    <th className="px-4 py-3 font-semibold">Detalhes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {logsPaginados.map((log) => (
                                    <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                                <Clock className="w-3 h-3" />
                                                {formatarData(log.created_at)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-gray-700 text-xs">
                                                {log.usuario_nome ?? (log.usuario_id ? usuarioMap.get(log.usuario_id) : null) ?? '—'}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase border ${getAcaoColor(log.acao)}`}>
                                                {log.acao}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-600">
                                            <span className="capitalize">{log.entidade}</span>
                                            {log.entidade_id && (
                                                <span className="text-[10px] text-gray-400 ml-1 font-mono">
                                                    #{log.entidade_id.slice(0, 8)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 max-w-xs">
                                            {Object.keys(log.detalhes).length > 0 ? (
                                                <div className="text-[11px] text-gray-500 space-y-0.5">
                                                    {Object.entries(log.detalhes).slice(0, 4).map(([k, v]) => (
                                                        <div key={k} className="flex gap-1">
                                                            <span className="font-semibold text-gray-600 capitalize">{k}:</span>
                                                            <span className="truncate max-w-[180px]">
                                                                {typeof v === 'number' 
                                                                    ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                    : String(v ?? '—')
                                                                }
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-300">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Paginacao
                        paginaAtual={pagina}
                        totalPaginas={totalPaginas}
                        totalItens={totalItens}
                        itensPorPagina={itensPorPagina}
                        onMudarPagina={setPagina}
                    />
                </div>
            )}
        </div>
    )
}
