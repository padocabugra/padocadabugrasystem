'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
    Search, AlertTriangle, Package, TrendingDown, Filter,
    Edit2, Plus, ArrowUpCircle, ArrowDownCircle, RefreshCw, ClipboardCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import { toast } from 'sonner'
import ModalProduto from '@/components/produtos/ModalProduto'
import type { Produto } from '@/lib/types/produto'

type FiltroEstoque = 'todos' | 'critico' | 'proprio' | 'terceirizado'

// ── Modal de ajuste de estoque rápido ────────────────────────────────────────
function ModalAjuste({
    produto,
    onClose,
    onSuccess,
}: {
    produto: Produto
    onClose: () => void
    onSuccess: () => void
}) {
    const [tipo, setTipo] = useState<'entrada' | 'saida' | 'ajuste'>('entrada')
    const [quantidade, setQuantidade] = useState('')
    const [observacao, setObservacao] = useState('')
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    async function handleAjuste() {
        const qtd = parseFloat(quantidade.replace(',', '.'))
        if (isNaN(qtd) || qtd <= 0) { toast.error('Informe uma quantidade válida'); return }

        setLoading(true)
        try {
            const delta = tipo === 'saida' ? -qtd : tipo === 'ajuste' ? qtd - Number(produto.estoque_atual) : qtd
            const novoEstoque = Math.max(0, Number(produto.estoque_atual) + (tipo === 'ajuste' ? 0 : delta))
            const estoqueAjustado = tipo === 'ajuste' ? qtd : novoEstoque

            const { error: prodErr } = await supabase
                .from('produtos')
                .update({ estoque_atual: estoqueAjustado, updated_at: new Date().toISOString() })
                .eq('id', produto.id)
            if (prodErr) throw prodErr

            await supabase.from('movimentacao_estoque').insert({
                produto_id: produto.id,
                tipo,
                quantidade: qtd,
                observacao: observacao || null,
            })

            toast.success('Estoque atualizado com sucesso')
            onSuccess()
            onClose()
        } catch (err: any) {
            toast.error('Erro ao ajustar estoque: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800">Ajuste de Estoque</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{produto.nome} · Atual: <strong>{produto.estoque_atual} {produto.unidade_medida}</strong></p>
                </div>
                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        {(['entrada', 'saida', 'ajuste'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTipo(t)}
                                className={`py-2 rounded-lg text-xs font-semibold capitalize border-2 transition-all ${tipo === t
                                    ? t === 'entrada' ? 'bg-emerald-600 border-emerald-600 text-white'
                                        : t === 'saida' ? 'bg-red-600 border-red-600 text-white'
                                            : 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                            >
                                {t === 'entrada' ? '↑ Entrada' : t === 'saida' ? '↓ Saída' : '⇄ Ajuste'}
                            </button>
                        ))}
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            {tipo === 'ajuste' ? 'Novo Saldo' : 'Quantidade'}
                        </label>
                        <div className="relative mt-1">
                            <input
                                type="number"
                                min="0"
                                step="0.001"
                                placeholder="0"
                                value={quantidade}
                                onChange={(e) => setQuantidade(e.target.value)}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-200 outline-none"
                                autoFocus
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                {produto.unidade_medida}
                            </span>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Observação (opcional)</label>
                        <input
                            type="text"
                            placeholder="Ex: Compra NF 001..."
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button onClick={onClose} className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={handleAjuste}
                            disabled={loading}
                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-1"
                        >
                            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Página Principal ─────────────────────────────────────────────────────────
export default function EstoquePage() {
    const [produtos, setProdutos] = useState<Produto[]>([])
    const [loading, setLoading] = useState(true)
    const [busca, setBusca] = useState('')
    const [filtro, setFiltro] = useState<FiltroEstoque>('todos')
    const [modalEditar, setModalEditar] = useState<Produto | null>(null)
    const [modalAjuste, setModalAjuste] = useState<Produto | null>(null)
    const [isModalNovo, setIsModalNovo] = useState(false)
    const supabase = createClient()

    const fetchProdutos = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('produtos')
            .select('*')
            .order('nome', { ascending: true })
        if (error) toast.error('Erro ao carregar estoque')
        else setProdutos((data ?? []) as Produto[])
        setLoading(false)
    }, [supabase])

    useEffect(() => { fetchProdutos() }, [fetchProdutos])

    // Estatísticas rápidas
    const stats = useMemo(() => ({
        total: produtos.length,
        criticos: produtos.filter(p => Number(p.estoque_atual) <= Number(p.estoque_minimo)).length,
        valorTotal: produtos.reduce((acc, p) => acc + Number(p.estoque_atual) * Number(p.custo), 0),
        semEstoque: produtos.filter(p => Number(p.estoque_atual) === 0).length,
    }), [produtos])

    // Filtro composto
    const produtosFiltrados = useMemo(() => {
        return produtos.filter((p) => {
            const matchBusca = !busca ||
                p.nome.toLowerCase().includes(busca.toLowerCase()) ||
                p.categoria.toLowerCase().includes(busca.toLowerCase())
            const matchFiltro =
                filtro === 'todos' ? true :
                    filtro === 'critico' ? Number(p.estoque_atual) <= Number(p.estoque_minimo) :
                        p.tipo === filtro
            return matchBusca && matchFiltro
        })
    }, [produtos, busca, filtro])

    const isCritico = (p: Produto) => Number(p.estoque_atual) <= Number(p.estoque_minimo)
    const pct = (p: Produto) => {
        const min = Number(p.estoque_minimo)
        const atual = Number(p.estoque_atual)
        if (min === 0) return 100
        return Math.min(100, Math.round((atual / min) * 100))
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <Package className="w-5 h-5 text-blue-600" />
                        Gestão de Estoque
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Controle de produtos, matérias-primas e alertas de reposição</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/dashboard/estoque/inventario"
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-sm"
                    >
                        <ClipboardCheck className="w-4 h-4" />
                        Fazer Inventário
                    </Link>
                    <button
                        onClick={() => setIsModalNovo(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Produto
                    </button>
                </div>
            </div>

            {/* Cards de Estatísticas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total de Itens', value: stats.total, icon: <Package className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { label: 'Estoque Crítico', value: stats.criticos, icon: <AlertTriangle className="w-4 h-4" />, color: stats.criticos > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-100' },
                    { label: 'Sem Estoque', value: stats.semEstoque, icon: <TrendingDown className="w-4 h-4" />, color: stats.semEstoque > 0 ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-gray-50 text-gray-600 border-gray-100' },
                    { label: 'Valor em Estoque', value: formatCurrency(stats.valorTotal), icon: <ArrowUpCircle className="w-4 h-4" />, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                ].map((s) => (
                    <div key={s.label} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.color}`}>
                        <div className="opacity-70">{s.icon}</div>
                        <div>
                            <p className="text-lg font-extrabold leading-none">{s.value}</p>
                            <p className="text-xs opacity-70 mt-0.5">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Barra de Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou categoria..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {([
                        { value: 'todos', label: 'Todos' },
                        { value: 'critico', label: '🔴 Crítico' },
                        { value: 'proprio', label: 'Produção Própria' },
                        { value: 'terceirizado', label: 'Revenda de Terceiros' },
                    ] as { value: FiltroEstoque; label: string }[]).map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setFiltro(f.value)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${filtro === f.value
                                ? f.value === 'critico'
                                    ? 'bg-red-600 border-red-600 text-white'
                                    : 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* DataTable */}
            {loading ? (
                <div className="flex justify-center p-16">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : produtosFiltrados.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 flex flex-col items-center text-gray-400">
                    <Package className="w-12 h-12 mb-3 opacity-20" />
                    <p className="font-medium">Nenhum produto encontrado</p>
                    {filtro === 'critico' && <p className="text-sm mt-1 text-emerald-600 font-semibold">✓ Nenhum item em estoque crítico!</p>}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/80 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-5 py-3 font-semibold">Produto</th>
                                    <th className="px-5 py-3 font-semibold">Tipo</th>
                                    <th className="px-5 py-3 font-semibold text-right">Estoque Atual</th>
                                    <th className="px-5 py-3 font-semibold">Nível</th>
                                    <th className="px-5 py-3 font-semibold text-right">Custo Un.</th>
                                    <th className="px-5 py-3 font-semibold text-center">Status</th>
                                    <th className="px-5 py-3 font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {produtosFiltrados.map((produto) => {
                                    const critico = isCritico(produto)
                                    const nivel = pct(produto)
                                    return (
                                        <tr key={produto.id} className={`transition-colors group ${critico ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-blue-50/30'}`}>
                                            {/* Produto */}
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    {critico && (
                                                        <span className="inline-flex items-center justify-center w-5 h-5 bg-red-100 rounded-full shrink-0" title="Estoque crítico">
                                                            <AlertTriangle className="w-3 h-3 text-red-600" />
                                                        </span>
                                                    )}
                                                    <div>
                                                        <p className={`font-semibold ${critico ? 'text-red-800' : 'text-gray-800'}`}>{produto.nome}</p>
                                                        <p className="text-xs text-gray-400">{produto.categoria}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Tipo */}
                                            <td className="px-5 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${produto.tipo === 'proprio' ? 'bg-blue-100 text-blue-700' : 'bg-sky-100 text-sky-700'}`}>
                                                    {produto.tipo === 'proprio' ? 'Próprio' : 'Insumo'}
                                                </span>
                                            </td>
                                            {/* Estoque */}
                                            <td className="px-5 py-3 text-right">
                                                <div>
                                                    <span className={`font-extrabold text-base ${critico ? 'text-red-600' : 'text-gray-800'}`}>
                                                        {Number(produto.estoque_atual).toLocaleString('pt-BR')}
                                                    </span>
                                                    <span className="text-xs text-gray-400 ml-1">{produto.unidade_medida}</span>
                                                </div>
                                                <p className="text-[10px] text-gray-400">Mín: {produto.estoque_minimo} {produto.unidade_medida}</p>
                                            </td>
                                            {/* Barra de Nível */}
                                            <td className="px-5 py-3 w-40">
                                                <div className="w-full bg-gray-100 rounded-full h-1.5">
                                                    <div
                                                        className={`h-1.5 rounded-full transition-all ${nivel <= 25 ? 'bg-red-500' : nivel <= 75 ? 'bg-sky-400' : 'bg-emerald-500'}`}
                                                        style={{ width: `${Math.min(nivel, 100)}%` }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-0.5">{nivel}% do mínimo</p>
                                            </td>
                                            {/* Custo */}
                                            <td className="px-5 py-3 text-right text-gray-600 font-medium">
                                                {formatCurrency(produto.custo)}
                                            </td>
                                            {/* Status */}
                                            <td className="px-5 py-3 text-center">
                                                {critico ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase">
                                                        <AlertTriangle className="w-2.5 h-2.5" /> Crítico
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase">
                                                        OK
                                                    </span>
                                                )}
                                            </td>
                                            {/* Ações */}
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => setModalAjuste(produto)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                                        title="Ajustar estoque"
                                                    >
                                                        <ArrowUpCircle className="w-3.5 h-3.5" />
                                                        Ajustar
                                                    </button>
                                                    <button
                                                        onClick={() => setModalEditar(produto)}
                                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                                        title="Editar produto"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
                        {produtosFiltrados.length} de {produtos.length} produto{produtos.length !== 1 ? 's' : ''}
                    </div>
                </div>
            )}

            {/* Modais */}
            {modalAjuste && (
                <ModalAjuste
                    produto={modalAjuste}
                    onClose={() => setModalAjuste(null)}
                    onSuccess={fetchProdutos}
                />
            )}
            <ModalProduto
                isOpen={isModalNovo || !!modalEditar}
                onClose={() => { setIsModalNovo(false); setModalEditar(null) }}
                onSuccess={fetchProdutos}
                produtoToEdit={modalEditar}
            />
        </div>
    )
}
