'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    BarChart3, Package, Warehouse, Landmark, CalendarDays,
    Download, ChevronDown, TrendingUp, TrendingDown,
    AlertTriangle, RefreshCw, FileText, FileSpreadsheet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import { exportToCSV, exportToPDF } from '@/lib/export-utils'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

type AbaAtiva = 'vendas' | 'produtos' | 'estoque' | 'caixa'

interface MetricaVenda {
    data: string
    total_faturado: number
    total_custo: number
    margem_bruta: number
    margem_pct: number
    ticket_medio: number
    qtd_vendas: number
    fat_anterior: number
    crescimento_pct: number
    receita_dinheiro: number
    receita_pix: number
    receita_debito: number
    receita_credito: number
}

interface CurvaABC {
    produto_id: string
    produto_nome: string
    categoria: string
    custo: number
    preco: number
    qtd_vendida: number
    faturamento: number
    custo_total: number
    lucro: number
    pct_faturamento: number
    pct_acumulado: number
    curva: string
    prejuizo: boolean
}

interface AuditoriaCaixa {
    data: string
    usuario_nome: string
    valor_abertura: number
    total_vendas_dinheiro: number
    total_vendas_pix: number
    total_vendas_cartao: number
    total_sangrias: number
    total_reforcos: number
    saldo_esperado: number
    saldo_registrado: number
    diferenca: number
}

interface AjusteEstoque {
    produto_id: string
    produto_nome: string
    categoria: string
    total_ajustes: number
    qtd_total_ajustada: number
    valor_perda: number
    ultimo_ajuste: string
    observacoes: string[] | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string) {
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function formatDateISO(d: Date): string {
    return d.toISOString().slice(0, 10)
}

function getDefaultDates() {
    const fim = new Date()
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - 30)
    return { inicio: formatDateISO(inicio), fim: formatDateISO(fim) }
}

// ─── Componente: Dropdown de Exportação ──────────────────────────────────────

function ExportDropdown({
    onCSV,
    onPDF,
}: {
    onCSV: () => void
    onPDF: () => void
}) {
    const [open, setOpen] = useState(false)

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:border-blue-300 rounded-lg transition-colors"
            >
                <Download className="w-3.5 h-3.5" />
                Exportar
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
                        <button
                            onClick={() => { onCSV(); setOpen(false) }}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-blue-50 transition-colors"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                            Exportar CSV
                        </button>
                        <button
                            onClick={() => { onPDF(); setOpen(false) }}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-blue-50 transition-colors border-t border-gray-50"
                        >
                            <FileText className="w-3.5 h-3.5 text-red-500" />
                            Exportar PDF
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Componente: Barra de Receita Visual ─────────────────────────────────────

function BarraReceita({
    dinheiro,
    pix,
    debito,
    credito,
}: {
    dinheiro: number
    pix: number
    debito: number
    credito: number
}) {
    const total = dinheiro + pix + debito + credito
    if (total === 0) return <p className="text-xs text-gray-400">Sem dados</p>

    const items = [
        { label: 'Dinheiro', valor: dinheiro, cor: 'bg-emerald-500', corText: 'text-emerald-700' },
        { label: 'PIX', valor: pix, cor: 'bg-sky-500', corText: 'text-sky-700' },
        { label: 'Débito', valor: debito, cor: 'bg-blue-600', corText: 'text-blue-700' },
        { label: 'Crédito', valor: credito, cor: 'bg-blue-400', corText: 'text-blue-700' },
    ]

    return (
        <div className="space-y-2">
            {/* Barra Stacked */}
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
                {items.map((it) => {
                    const pct = (it.valor / total) * 100
                    if (pct <= 0) return null
                    return (
                        <div
                            key={it.label}
                            className={`${it.cor} transition-all`}
                            style={{ width: `${pct}%` }}
                            title={`${it.label}: ${formatCurrency(it.valor)} (${pct.toFixed(1)}%)`}
                        />
                    )
                })}
            </div>
            {/* Legenda */}
            <div className="flex flex-wrap gap-3">
                {items.map((it) => {
                    const pct = total > 0 ? ((it.valor / total) * 100).toFixed(1) : '0'
                    return (
                        <div key={it.label} className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${it.cor}`} />
                            <span className={`text-xs font-semibold ${it.corText}`}>
                                {it.label}: {formatCurrency(it.valor)} ({pct}%)
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Página Principal ────────────────────────────────────────────────────────

export default function RelatoriosPage() {
    const supabase = createClient()
    const defaultDates = useMemo(() => getDefaultDates(), [])

    const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('vendas')
    const [dataInicio, setDataInicio] = useState(defaultDates.inicio)
    const [dataFim, setDataFim] = useState(defaultDates.fim)
    const [loading, setLoading] = useState(false)

    // Data states
    const [metricasVendas, setMetricasVendas] = useState<MetricaVenda[]>([])
    const [curvaABC, setCurvaABC] = useState<CurvaABC[]>([])
    const [auditoriaCaixa, setAuditoriaCaixa] = useState<AuditoriaCaixa[]>([])
    const [ajustesEstoque, setAjustesEstoque] = useState<AjusteEstoque[]>([])

    const periodoLabel = `${formatDate(dataInicio)} a ${formatDate(dataFim)}`

    // ── Fetch Functions ──────────────────────────────────────────────────────

    const fetchVendas = useCallback(async () => {
        const { data, error } = await supabase.rpc('fn_metricas_vendas', {
            p_data_inicio: `${dataInicio}T00:00:00Z`,
            p_data_fim: `${dataFim}T23:59:59Z`,
        })
        if (error) toast.error('Erro ao carregar métricas de vendas')
        else setMetricasVendas((data ?? []) as MetricaVenda[])
    }, [supabase, dataInicio, dataFim])

    const fetchProdutos = useCallback(async () => {
        const { data, error } = await supabase.rpc('fn_curva_abc_produtos', {
            p_data_inicio: `${dataInicio}T00:00:00Z`,
            p_data_fim: `${dataFim}T23:59:59Z`,
        })
        if (error) toast.error('Erro ao carregar curva ABC')
        else setCurvaABC((data ?? []) as CurvaABC[])
    }, [supabase, dataInicio, dataFim])

    const fetchCaixa = useCallback(async () => {
        const { data, error } = await supabase.rpc('fn_auditoria_caixa', {
            p_data_inicio: `${dataInicio}T00:00:00Z`,
            p_data_fim: `${dataFim}T23:59:59Z`,
        })
        if (error) toast.error('Erro ao carregar auditoria de caixa')
        else setAuditoriaCaixa((data ?? []) as AuditoriaCaixa[])
    }, [supabase, dataInicio, dataFim])

    const fetchEstoque = useCallback(async () => {
        const { data, error } = await supabase.rpc('fn_relatorio_ajustes_estoque', {
            p_data_inicio: `${dataInicio}T00:00:00Z`,
            p_data_fim: `${dataFim}T23:59:59Z`,
        })
        if (error) toast.error('Erro ao carregar ajustes de estoque')
        else setAjustesEstoque((data ?? []) as AjusteEstoque[])
    }, [supabase, dataInicio, dataFim])

    const fetchAll = useCallback(async () => {
        setLoading(true)
        await Promise.all([fetchVendas(), fetchProdutos(), fetchCaixa(), fetchEstoque()])
        setLoading(false)
    }, [fetchVendas, fetchProdutos, fetchCaixa, fetchEstoque])

    useEffect(() => { fetchAll() }, [fetchAll])

    // ── Resumo Vendas ────────────────────────────────────────────────────────

    const resumoVendas = useMemo(() => {
        const totalFat = metricasVendas.reduce((s, m) => s + Number(m.total_faturado), 0)
        const totalCusto = metricasVendas.reduce((s, m) => s + Number(m.total_custo), 0)
        const totalVendas = metricasVendas.reduce((s, m) => s + Number(m.qtd_vendas), 0)
        const ticketMedio = totalVendas > 0 ? totalFat / totalVendas : 0
        const margem = totalFat > 0 ? ((totalFat - totalCusto) / totalFat) * 100 : 0
        const dinheiro = metricasVendas.reduce((s, m) => s + Number(m.receita_dinheiro), 0)
        const pix = metricasVendas.reduce((s, m) => s + Number(m.receita_pix), 0)
        const debito = metricasVendas.reduce((s, m) => s + Number(m.receita_debito), 0)
        const credito = metricasVendas.reduce((s, m) => s + Number(m.receita_credito), 0)

        return { totalFat, totalCusto, totalVendas, ticketMedio, margem, dinheiro, pix, debito, credito }
    }, [metricasVendas])

    // ── Exportações ──────────────────────────────────────────────────────────

    function exportVendasCSV() {
        const rows = metricasVendas.map((m) => ({
            Data: formatDate(m.data),
            'Total Faturado': Number(m.total_faturado).toFixed(2),
            'Custo Total': Number(m.total_custo).toFixed(2),
            'Margem Bruta': Number(m.margem_bruta).toFixed(2),
            'Margem %': Number(m.margem_pct).toFixed(2),
            'Ticket Médio': Number(m.ticket_medio).toFixed(2),
            'Qtd Vendas': m.qtd_vendas,
            'Crescimento %': Number(m.crescimento_pct).toFixed(2),
            'Dinheiro': Number(m.receita_dinheiro).toFixed(2),
            'PIX': Number(m.receita_pix).toFixed(2),
            'Débito': Number(m.receita_debito).toFixed(2),
            'Crédito': Number(m.receita_credito).toFixed(2),
        }))
        exportToCSV(rows, { filename: 'relatorio_vendas', title: 'Relatório de Vendas' })
        toast.success('CSV de Vendas exportado')
    }

    function exportVendasPDF() {
        exportToPDF(
            ['Data', 'Faturado', 'Custo', 'Margem', 'Margem%', 'Ticket', 'Vendas', 'Cresc%'],
            metricasVendas.map((m) => [
                formatDate(m.data),
                formatCurrency(Number(m.total_faturado)),
                formatCurrency(Number(m.total_custo)),
                formatCurrency(Number(m.margem_bruta)),
                `${Number(m.margem_pct).toFixed(1)}%`,
                formatCurrency(Number(m.ticket_medio)),
                m.qtd_vendas,
                `${Number(m.crescimento_pct).toFixed(1)}%`,
            ]),
            { filename: 'relatorio_vendas', title: 'Relatório de Vendas', subtitle: 'Métricas diárias de vendas', periodo: periodoLabel }
        )
        toast.success('PDF de Vendas exportado')
    }

    function exportProdutosCSV() {
        const rows = curvaABC.map((p) => ({
            Produto: p.produto_nome,
            Categoria: p.categoria,
            'Qtd Vendida': Number(p.qtd_vendida).toFixed(2),
            Faturamento: Number(p.faturamento).toFixed(2),
            'Custo Total': Number(p.custo_total).toFixed(2),
            Lucro: Number(p.lucro).toFixed(2),
            '% Faturamento': Number(p.pct_faturamento).toFixed(2),
            '% Acumulado': Number(p.pct_acumulado).toFixed(2),
            Curva: p.curva,
            Prejuízo: p.prejuizo ? 'SIM' : 'NÃO',
        }))
        exportToCSV(rows, { filename: 'curva_abc_produtos', title: 'Curva ABC de Produtos' })
        toast.success('CSV de Produtos exportado')
    }

    function exportProdutosPDF() {
        exportToPDF(
            ['Produto', 'Categoria', 'Qtd', 'Fat.', 'Custo', 'Lucro', '%Fat', '%Acum', 'Curva'],
            curvaABC.map((p) => [
                p.produto_nome,
                p.categoria,
                Number(p.qtd_vendida).toFixed(0),
                formatCurrency(Number(p.faturamento)),
                formatCurrency(Number(p.custo_total)),
                formatCurrency(Number(p.lucro)),
                `${Number(p.pct_faturamento).toFixed(1)}%`,
                `${Number(p.pct_acumulado).toFixed(1)}%`,
                p.curva,
            ]),
            { filename: 'curva_abc_produtos', title: 'Curva ABC de Produtos', subtitle: 'Ranking de produtos por representatividade', periodo: periodoLabel }
        )
        toast.success('PDF de Produtos exportado')
    }

    function exportEstoqueCSV() {
        const rows = ajustesEstoque.map((a) => ({
            Produto: a.produto_nome,
            Categoria: a.categoria,
            'Total Ajustes': a.total_ajustes,
            'Qtd Ajustada': Number(a.qtd_total_ajustada).toFixed(2),
            'Valor Perda R$': Number(a.valor_perda).toFixed(2),
            'Último Ajuste': new Date(a.ultimo_ajuste).toLocaleDateString('pt-BR'),
            Observações: a.observacoes?.join('; ') ?? '',
        }))
        exportToCSV(rows, { filename: 'relatorio_estoque_ajustes', title: 'Relatório de Ajustes de Estoque' })
        toast.success('CSV de Estoque exportado')
    }

    function exportEstoquePDF() {
        exportToPDF(
            ['Produto', 'Categoria', 'Ajustes', 'Qtd Ajustada', 'Valor Perda', 'Último Ajuste'],
            ajustesEstoque.map((a) => [
                a.produto_nome,
                a.categoria,
                a.total_ajustes,
                Number(a.qtd_total_ajustada).toFixed(2),
                formatCurrency(Number(a.valor_perda)),
                new Date(a.ultimo_ajuste).toLocaleDateString('pt-BR'),
            ]),
            { filename: 'relatorio_estoque_ajustes', title: 'Relatório de Ajustes de Estoque', subtitle: 'Produtos com maior índice de perda', periodo: periodoLabel }
        )
        toast.success('PDF de Estoque exportado')
    }

    function exportCaixaCSV() {
        const rows = auditoriaCaixa.map((a) => ({
            Data: formatDate(a.data),
            Operador: a.usuario_nome,
            Abertura: Number(a.valor_abertura).toFixed(2),
            'Vendas Dinheiro': Number(a.total_vendas_dinheiro).toFixed(2),
            'Vendas PIX': Number(a.total_vendas_pix).toFixed(2),
            'Vendas Cartão': Number(a.total_vendas_cartao).toFixed(2),
            Sangrias: Number(a.total_sangrias).toFixed(2),
            Reforços: Number(a.total_reforcos).toFixed(2),
            'Saldo Esperado': Number(a.saldo_esperado).toFixed(2),
            'Saldo Registrado': Number(a.saldo_registrado).toFixed(2),
            Diferença: Number(a.diferenca).toFixed(2),
        }))
        exportToCSV(rows, { filename: 'auditoria_caixa', title: 'Auditoria de Caixa' })
        toast.success('CSV de Caixa exportado')
    }

    function exportCaixaPDF() {
        exportToPDF(
            ['Data', 'Operador', 'Abertura', 'Dinheiro', 'PIX', 'Cartão', 'Sangria', 'Reforço', 'Esperado', 'Registrado', 'Dif.'],
            auditoriaCaixa.map((a) => [
                formatDate(a.data),
                a.usuario_nome,
                formatCurrency(Number(a.valor_abertura)),
                formatCurrency(Number(a.total_vendas_dinheiro)),
                formatCurrency(Number(a.total_vendas_pix)),
                formatCurrency(Number(a.total_vendas_cartao)),
                formatCurrency(Number(a.total_sangrias)),
                formatCurrency(Number(a.total_reforcos)),
                formatCurrency(Number(a.saldo_esperado)),
                formatCurrency(Number(a.saldo_registrado)),
                formatCurrency(Number(a.diferenca)),
            ]),
            { filename: 'auditoria_caixa', title: 'Auditoria de Caixa', subtitle: 'Cruzamento de entradas com saldo registrado', periodo: periodoLabel }
        )
        toast.success('PDF de Caixa exportado')
    }

    // ── TABS ─────────────────────────────────────────────────────────────────

    const ABAS: { key: AbaAtiva; label: string; icon: React.ReactNode }[] = [
        { key: 'vendas', label: 'Vendas', icon: <BarChart3 className="w-4 h-4" /> },
        { key: 'produtos', label: 'Produtos', icon: <Package className="w-4 h-4" /> },
        { key: 'estoque', label: 'Estoque', icon: <Warehouse className="w-4 h-4" /> },
        { key: 'caixa', label: 'Caixa', icon: <Landmark className="w-4 h-4" /> },
    ]

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                        Relatórios &amp; BI
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Inteligência de negócios com cálculos diretos do PostgreSQL
                    </p>
                </div>
                <button
                    onClick={fetchAll}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </button>
            </div>

            {/* DateRangePicker Global */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                    Período:
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                    <span className="text-gray-400 text-sm">até</span>
                    <input
                        type="date"
                        value={dataFim}
                        onChange={(e) => setDataFim(e.target.value)}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                    />
                </div>
                <div className="flex gap-1.5 ml-auto">
                    {[
                        { label: '7d', days: 7 },
                        { label: '15d', days: 15 },
                        { label: '30d', days: 30 },
                        { label: '90d', days: 90 },
                    ].map((p) => (
                        <button
                            key={p.label}
                            onClick={() => {
                                const fim = new Date()
                                const ini = new Date()
                                ini.setDate(ini.getDate() - p.days)
                                setDataInicio(formatDateISO(ini))
                                setDataFim(formatDateISO(fim))
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 rounded-lg transition-colors"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {ABAS.map((aba) => (
                    <button
                        key={aba.key}
                        onClick={() => setAbaAtiva(aba.key)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-1 justify-center ${abaAtiva === aba.key
                                ? 'bg-white text-blue-700 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {aba.icon}
                        {aba.label}
                    </button>
                ))}
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex justify-center p-12">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            {/* ═══════ ABA: VENDAS ═══════ */}
            {!loading && abaAtiva === 'vendas' && (
                <div className="space-y-4">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        {[
                            { label: 'Total Faturado', value: formatCurrency(resumoVendas.totalFat), color: 'bg-blue-50 text-blue-700 border-blue-100' },
                            { label: 'Margem Bruta', value: `${resumoVendas.margem.toFixed(1)}%`, color: resumoVendas.margem > 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-200' },
                            { label: 'Ticket Médio', value: formatCurrency(resumoVendas.ticketMedio), color: 'bg-blue-100 text-blue-700 border-blue-200' },
                            { label: 'Total Vendas', value: resumoVendas.totalVendas, color: 'bg-gray-50 text-gray-700 border-gray-100' },
                            { label: 'Custo Total', value: formatCurrency(resumoVendas.totalCusto), color: 'bg-blue-50 text-blue-700 border-blue-100' },
                        ].map((kpi) => (
                            <div key={kpi.label} className={`px-4 py-3 rounded-xl border ${kpi.color}`}>
                                <p className="text-lg font-extrabold leading-none">{kpi.value}</p>
                                <p className="text-xs opacity-70 mt-0.5">{kpi.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Gráfico Composição Receita */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <h3 className="text-sm font-bold text-gray-700 mb-3">Composição de Receita por Forma de Pagamento</h3>
                        <BarraReceita
                            dinheiro={resumoVendas.dinheiro}
                            pix={resumoVendas.pix}
                            debito={resumoVendas.debito}
                            credito={resumoVendas.credito}
                        />
                    </div>

                    {/* Tabela */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700">Métricas Diárias</h3>
                            <ExportDropdown onCSV={exportVendasCSV} onPDF={exportVendasPDF} />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50/80 border-b text-xs text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-2.5 font-semibold">Data</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Faturado</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Custo</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Margem</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Ticket</th>
                                        <th className="px-4 py-2.5 font-semibold text-center">Vendas</th>
                                        <th className="px-4 py-2.5 font-semibold text-center">Crescimento</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {metricasVendas.length === 0 ? (
                                        <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhuma venda no período</td></tr>
                                    ) : metricasVendas.map((m) => (
                                        <tr key={m.data} className="hover:bg-blue-50/30">
                                            <td className="px-4 py-2.5 font-medium">{formatDate(m.data)}</td>
                                            <td className="px-4 py-2.5 text-right font-bold">{formatCurrency(Number(m.total_faturado))}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-500">{formatCurrency(Number(m.total_custo))}</td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className={`font-bold ${Number(m.margem_pct) >= 30 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {Number(m.margem_pct).toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">{formatCurrency(Number(m.ticket_medio))}</td>
                                            <td className="px-4 py-2.5 text-center font-semibold">{m.qtd_vendas}</td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${Number(m.crescimento_pct) > 0 ? 'text-emerald-600' : Number(m.crescimento_pct) < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                                    {Number(m.crescimento_pct) > 0 ? <TrendingUp className="w-3 h-3" /> : Number(m.crescimento_pct) < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                                                    {Number(m.crescimento_pct).toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ ABA: PRODUTOS ═══════ */}
            {!loading && abaAtiva === 'produtos' && (
                <div className="space-y-4">
                    {/* Alertas de Prejuízo */}
                    {curvaABC.some((p) => p.prejuizo) && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-red-800">Produtos com Prejuízo Detectado!</p>
                                <p className="text-xs text-red-600 mt-1">
                                    {curvaABC.filter((p) => p.prejuizo).map((p) => p.produto_nome).join(', ')}
                                    {' — '}Custo unitário superior ao preço de venda.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Tabela Curva ABC */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700">Curva ABC de Produtos</h3>
                            <ExportDropdown onCSV={exportProdutosCSV} onPDF={exportProdutosPDF} />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50/80 border-b text-xs text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-2.5 font-semibold">Curva</th>
                                        <th className="px-4 py-2.5 font-semibold">Produto</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Qtd</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Faturamento</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Custo</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Lucro</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">% Fat.</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">% Acumulado</th>
                                        <th className="px-4 py-2.5 font-semibold text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {curvaABC.length === 0 ? (
                                        <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Nenhum produto vendido no período</td></tr>
                                    ) : curvaABC.map((p) => (
                                        <tr key={p.produto_id} className={`hover:bg-blue-50/30 ${p.prejuizo ? 'bg-red-50/40' : ''}`}>
                                            <td className="px-4 py-2.5">
                                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black ${p.curva === 'A' ? 'bg-emerald-100 text-emerald-700'
                                                        : p.curva === 'B' ? 'bg-blue-50 text-blue-700'
                                                            : 'bg-gray-100 text-gray-500'
                                                    }`}>
                                                    {p.curva}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <p className="font-semibold text-gray-800">{p.produto_nome}</p>
                                                <p className="text-xs text-gray-400">{p.categoria}</p>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-medium">{Number(p.qtd_vendida).toLocaleString('pt-BR')}</td>
                                            <td className="px-4 py-2.5 text-right font-bold">{formatCurrency(Number(p.faturamento))}</td>
                                            <td className="px-4 py-2.5 text-right text-gray-500">{formatCurrency(Number(p.custo_total))}</td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className={`font-bold ${Number(p.lucro) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {formatCurrency(Number(p.lucro))}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right text-gray-600">{Number(p.pct_faturamento).toFixed(1)}%</td>
                                            <td className="px-4 py-2.5 text-right text-gray-600">{Number(p.pct_acumulado).toFixed(1)}%</td>
                                            <td className="px-4 py-2.5 text-center">
                                                {p.prejuizo ? (
                                                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase">
                                                        <AlertTriangle className="w-2.5 h-2.5" /> Prejuízo
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase">
                                                        OK
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ ABA: ESTOQUE ═══════ */}
            {!loading && abaAtiva === 'estoque' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700">Índice de Perda / Ajustes de Inventário</h3>
                            <ExportDropdown onCSV={exportEstoqueCSV} onPDF={exportEstoquePDF} />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50/80 border-b text-xs text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-4 py-2.5 font-semibold">Produto</th>
                                        <th className="px-4 py-2.5 font-semibold">Categoria</th>
                                        <th className="px-4 py-2.5 font-semibold text-center">Ajustes</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Qtd Ajustada</th>
                                        <th className="px-4 py-2.5 font-semibold text-right">Valor Perda</th>
                                        <th className="px-4 py-2.5 font-semibold">Último Ajuste</th>
                                        <th className="px-4 py-2.5 font-semibold">Observações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {ajustesEstoque.length === 0 ? (
                                        <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nenhum ajuste de estoque no período</td></tr>
                                    ) : ajustesEstoque.map((a) => (
                                        <tr key={a.produto_id} className="hover:bg-blue-50/30">
                                            <td className="px-4 py-2.5 font-semibold text-gray-800">{a.produto_nome}</td>
                                            <td className="px-4 py-2.5">
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold uppercase">{a.categoria}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-xs">{a.total_ajustes}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-medium">{Number(a.qtd_total_ajustada).toLocaleString('pt-BR')}</td>
                                            <td className="px-4 py-2.5 text-right">
                                                <span className="font-bold text-red-600">{formatCurrency(Number(a.valor_perda))}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-gray-500">{new Date(a.ultimo_ajuste).toLocaleDateString('pt-BR')}</td>
                                            <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[200px] truncate" title={a.observacoes?.join('; ') ?? ''}>
                                                {a.observacoes?.join('; ') ?? '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ ABA: CAIXA ═══════ */}
            {!loading && abaAtiva === 'caixa' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700">Auditoria de Caixa — Discrepâncias</h3>
                            <ExportDropdown onCSV={exportCaixaCSV} onPDF={exportCaixaPDF} />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50/80 border-b text-xs text-gray-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="px-3 py-2.5 font-semibold">Data</th>
                                        <th className="px-3 py-2.5 font-semibold">Operador</th>
                                        <th className="px-3 py-2.5 font-semibold text-right">Abertura</th>
                                        <th className="px-3 py-2.5 font-semibold text-right">Dinheiro</th>
                                        <th className="px-3 py-2.5 font-semibold text-right">PIX</th>
                                        <th className="px-3 py-2.5 font-semibold text-right">Cartão</th>
                                        <th className="px-3 py-2.5 font-semibold text-right">Sangria</th>
                                        <th className="px-3 py-2.5 font-semibold text-right">Reforço</th>
                                        <th className="px-3 py-2.5 font-semibold text-right">Esperado</th>
                                        <th className="px-3 py-2.5 font-semibold text-right">Registrado</th>
                                        <th className="px-3 py-2.5 font-semibold text-center">Diferença</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {auditoriaCaixa.length === 0 ? (
                                        <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Nenhum registro de caixa no período</td></tr>
                                    ) : auditoriaCaixa.map((a, i) => {
                                        const dif = Number(a.diferenca)
                                        return (
                                            <tr key={`${a.data}-${a.usuario_nome}-${i}`} className={`hover:bg-blue-50/30 ${dif !== 0 ? 'bg-red-50/30' : ''}`}>
                                                <td className="px-3 py-2.5 font-medium">{formatDate(a.data)}</td>
                                                <td className="px-3 py-2.5 font-semibold text-gray-800">{a.usuario_nome}</td>
                                                <td className="px-3 py-2.5 text-right">{formatCurrency(Number(a.valor_abertura))}</td>
                                                <td className="px-3 py-2.5 text-right">{formatCurrency(Number(a.total_vendas_dinheiro))}</td>
                                                <td className="px-3 py-2.5 text-right">{formatCurrency(Number(a.total_vendas_pix))}</td>
                                                <td className="px-3 py-2.5 text-right">{formatCurrency(Number(a.total_vendas_cartao))}</td>
                                                <td className="px-3 py-2.5 text-right text-red-600">{formatCurrency(Number(a.total_sangrias))}</td>
                                                <td className="px-3 py-2.5 text-right text-emerald-600">{formatCurrency(Number(a.total_reforcos))}</td>
                                                <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(Number(a.saldo_esperado))}</td>
                                                <td className="px-3 py-2.5 text-right font-bold">{formatCurrency(Number(a.saldo_registrado))}</td>
                                                <td className="px-3 py-2.5 text-center">
                                                    {dif === 0 ? (
                                                        <span className="inline-flex px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">OK</span>
                                                    ) : (
                                                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${dif > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                            <AlertTriangle className="w-2.5 h-2.5" />
                                                            {dif > 0 ? '+' : ''}{formatCurrency(dif)}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
