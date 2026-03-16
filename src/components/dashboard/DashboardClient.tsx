'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import {
    DollarSign, ShoppingCart, TrendingUp, AlertTriangle,
    RefreshCw, Clock, BarChart3, Activity,
} from 'lucide-react'
import {
    AreaChart, Area, BarChart, Bar, CartesianGrid, XAxis, YAxis,
    Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Kpis {
    total_vendas: number
    qtd_pedidos: number
    ticket_medio: number
    estoque_critico: number
}

interface VendaHora {
    hora: number
    valor: number
}

interface TopProduto {
    nome: string
    quantidade: number
}

interface DashboardClientProps {
    nomeUsuario: string
    role: string
}

// ── Paleta de cores para barras ────────────────────────────────────────────────

const BAR_COLORS = ['#054F77', '#0A6B9C', '#1089C2', '#16A6E7', '#42BFF5']

// ── Tooltip customizado para o AreaChart ───────────────────────────────────────

function AreaTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2 shadow-lg">
            <p className="text-[11px] text-gray-500 font-semibold">{String(label).padStart(2, '0')}:00h</p>
            <p className="text-sm font-extrabold text-gray-800">{formatCurrency(payload[0].value)}</p>
        </div>
    )
}

function BarTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-2 shadow-lg">
            <p className="text-xs font-semibold text-gray-800">{payload[0].payload.nome}</p>
            <p className="text-sm font-extrabold" style={{ color: '#054F77' }}>{Number(payload[0].value).toLocaleString('pt-BR')} un.</p>
        </div>
    )
}

// ── Componente Principal ───────────────────────────────────────────────────────

export default function DashboardClient({ nomeUsuario, role }: DashboardClientProps) {
    const [kpis, setKpis] = useState<Kpis | null>(null)
    const [vendasHora, setVendasHora] = useState<VendaHora[]>([])
    const [topProdutos, setTopProdutos] = useState<TopProduto[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date>(new Date())
    const supabase = createClient()

    const fetchDashboard = useCallback(async (silencioso = false) => {
        if (!silencioso) setLoading(true)
        else setRefreshing(true)

        try {
            const [kpiRes, horaRes, topRes] = await Promise.all([
                supabase.rpc('dashboard_kpis_hoje'),
                supabase.rpc('dashboard_vendas_por_hora'),
                supabase.rpc('dashboard_top_produtos'),
            ])

            if (kpiRes.data) setKpis(kpiRes.data as Kpis)
            if (horaRes.data) setVendasHora(horaRes.data as VendaHora[])
            if (topRes.data) setTopProdutos(topRes.data as TopProduto[])
            setUltimaAtualizacao(new Date())
        } catch (err) {
            console.error('Dashboard fetch error:', err)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [supabase])

    // Fetch inicial + auto-refresh a cada 30s
    useEffect(() => {
        fetchDashboard()
        const interval = setInterval(() => fetchDashboard(true), 30_000)
        return () => clearInterval(interval)
    }, [fetchDashboard])

    // Hora de pico
    const horaPico = useMemo(() => {
        if (vendasHora.length === 0) return null
        const pico = vendasHora.reduce((max, v) => (v.valor > max.valor ? v : max), vendasHora[0])
        return pico.valor > 0 ? pico : null
    }, [vendasHora])

    // Formatador compacto para horas no eixo X
    const formatHora = (h: number) => `${String(h).padStart(2, '0')}h`

    const ROLE_LABELS: Record<string, { label: string; color: string }> = {
        admin: { label: 'Administrador', color: 'bg-blue-100 text-blue-700' },
        caixa: { label: 'Caixa', color: 'bg-sky-100 text-sky-700' },
        vendedor: { label: 'Vendedor', color: 'bg-emerald-100 text-emerald-700' },
        cozinha: { label: 'Cozinha', color: 'bg-blue-50 text-blue-700' },
    }
    const roleInfo = ROLE_LABELS[role] ?? ROLE_LABELS.vendedor

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-gray-500 font-medium">Carregando dashboard...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* ─── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900">
                        Olá, {nomeUsuario} 👋
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Visão geral da Padoca da Bugra — {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => fetchDashboard(true)}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-all disabled:opacity-50"
                        title="Atualizar dados"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        Atualizar
                    </button>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${roleInfo.color}`}>
                        {roleInfo.label}
                    </span>
                </div>
            </div>

            {/* ─── KPI Cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Faturamento */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 group hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <DollarSign className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Hoje</span>
                    </div>
                    <p className="text-2xl font-extrabold text-gray-900 leading-none">
                        {formatCurrency(kpis?.total_vendas ?? 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Faturamento</p>
                </div>

                {/* Pedidos */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 group hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center">
                            <ShoppingCart className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Hoje</span>
                    </div>
                    <p className="text-2xl font-extrabold text-gray-900 leading-none">
                        {kpis?.qtd_pedidos ?? 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Pedidos Entregues</p>
                </div>

                {/* Ticket Médio */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 group hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-blue-600" />
                        </div>
                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Hoje</span>
                    </div>
                    <p className="text-2xl font-extrabold text-gray-900 leading-none">
                        {formatCurrency(kpis?.ticket_medio ?? 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Ticket Médio</p>
                </div>

                {/* Estoque Crítico */}
                <div className={`rounded-2xl border shadow-sm p-4 group hover:shadow-md transition-shadow ${(kpis?.estoque_critico ?? 0) > 0
                    ? 'bg-red-50/60 border-red-200'
                    : 'bg-white border-gray-100'
                    }`}>
                    <div className="flex items-center justify-between mb-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${(kpis?.estoque_critico ?? 0) > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                            <AlertTriangle className={`w-4 h-4 ${(kpis?.estoque_critico ?? 0) > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                        </div>
                        {(kpis?.estoque_critico ?? 0) > 0 && (
                            <span className="text-[10px] bg-red-600 text-white font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                                ALERTA
                            </span>
                        )}
                    </div>
                    <p className={`text-2xl font-extrabold leading-none ${(kpis?.estoque_critico ?? 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                        {kpis?.estoque_critico ?? 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Estoque Crítico</p>
                </div>
            </div>

            {/* ─── Gráficos ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Vendas por Hora — AreaChart (ocupa 3/5) */}
                <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-sm font-extrabold text-gray-800 flex items-center gap-1.5">
                                <Activity className="w-4 h-4 text-blue-500" />
                                Vendas por Hora
                            </h2>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Movimento do dia em tempo real
                                {horaPico && (
                                    <span className="ml-1.5 font-semibold" style={{ color: '#054F77' }}>
                                        · Pico às {formatHora(horaPico.hora)}
                                    </span>
                                )}
                            </p>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                            <Clock className="w-3 h-3" />
                            {ultimaAtualizacao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>

                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={vendasHora} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gradientVendas" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis
                                    dataKey="hora"
                                    tickFormatter={formatHora}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={2}
                                />
                                <YAxis
                                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={false}
                                    tickLine={false}
                                    width={40}
                                />
                                <Tooltip content={<AreaTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="valor"
                                    stroke="#054F77"
                                    strokeWidth={2.5}
                                    fill="url(#gradientVendas)"
                                    dot={false}
                                    activeDot={{ r: 5, fill: '#054F77', stroke: '#fff', strokeWidth: 2 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top 5 Produtos — BarChart horizontal (ocupa 2/5) */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="mb-4">
                        <h2 className="text-sm font-extrabold text-gray-800 flex items-center gap-1.5">
                            <BarChart3 className="w-4 h-4 text-blue-500" />
                            Top 5 Produtos
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">Mais vendidos hoje</p>
                    </div>

                    {topProdutos.length === 0 ? (
                        <div className="h-56 flex flex-col items-center justify-center text-gray-400">
                            <ShoppingCart className="w-8 h-8 opacity-20 mb-2" />
                            <p className="text-xs font-medium">Nenhuma venda registrada hoje</p>
                        </div>
                    ) : (
                        <div className="h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={topProdutos}
                                    layout="vertical"
                                    margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="nome"
                                        width={90}
                                        tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip content={<BarTooltip />} />
                                    <Bar dataKey="quantidade" radius={[0, 6, 6, 0]} barSize={18}>
                                        {topProdutos.map((_, index) => (
                                            <Cell key={index} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Footer de atualização ──────────────────────────────────── */}
            <div className="flex items-center justify-center gap-1.5 py-2">
                <div className={`w-1.5 h-1.5 rounded-full ${refreshing ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}`} />
                <p className="text-[10px] text-gray-400 font-medium">
                    {refreshing
                        ? 'Atualizando...'
                        : `Atualizado às ${ultimaAtualizacao.toLocaleTimeString('pt-BR')} · Refresh a cada 30s`
                    }
                </p>
            </div>
        </div>
    )
}
