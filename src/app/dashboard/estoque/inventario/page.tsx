'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
    ClipboardCheck, Search, Save, RefreshCw, AlertTriangle,
    CheckCircle2, Package, ArrowLeftRight, Undo2, HelpCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Produto } from '@/lib/types/produto'

interface ContagemItem {
    produto_id: string
    contagem_fisica: string
    estoque_sistema: number
}

export default function InventarioPage() {
    const [produtos, setProdutos] = useState<Produto[]>([])
    const [loading, setLoading] = useState(true)
    const [salvando, setSalvando] = useState(false)
    const [busca, setBusca] = useState('')
    const [contagens, setContagens] = useState<Record<string, string>>({})
    const [filtroDiv, setFiltroDiv] = useState<'todos' | 'divergentes'>('todos')
    const supabase = createClient()

    const fetchProdutos = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('produtos')
            .select('*')
            .eq('ativo', true)
            .order('nome', { ascending: true })
        if (error) {
            toast.error('Erro ao carregar produtos')
        } else {
            setProdutos((data ?? []) as Produto[])
        }
        setLoading(false)
    }, [supabase])

    useEffect(() => { fetchProdutos() }, [fetchProdutos])

    function handleContagemChange(produtoId: string, valor: string) {
        setContagens((prev) => {
            const next = { ...prev }
            if (valor === '' || valor === undefined) {
                delete next[produtoId]
            } else {
                next[produtoId] = valor
            }
            return next
        })
    }

    const divergencias = useMemo(() => {
        const result: { produto: Produto; contagem: number; diferenca: number }[] = []
        for (const produto of produtos) {
            const raw = contagens[produto.id]
            if (raw === undefined || raw === '') continue
            const contagem = parseFloat(raw.replace(',', '.'))
            if (isNaN(contagem)) continue
            const estoqueAtual = Number(produto.estoque_atual)
            const diferenca = contagem - estoqueAtual
            if (diferenca !== 0) {
                result.push({ produto, contagem, diferenca })
            }
        }
        return result
    }, [contagens, produtos])

    const totalPreenchidos = useMemo(() => {
        return Object.values(contagens).filter((v) => v !== '' && v !== undefined).length
    }, [contagens])

    const produtosFiltrados = useMemo(() => {
        let lista = produtos

        if (busca) {
            const termo = busca.toLowerCase()
            lista = lista.filter((p) =>
                p.nome.toLowerCase().includes(termo) ||
                p.categoria.toLowerCase().includes(termo)
            )
        }

        if (filtroDiv === 'divergentes') {
            const idsDiv = new Set(divergencias.map((d) => d.produto.id))
            lista = lista.filter((p) => idsDiv.has(p.id))
        }

        return lista
    }, [produtos, busca, filtroDiv, divergencias])

    function getDiferenca(produto: Produto): { contagem: number; diferenca: number } | null {
        const raw = contagens[produto.id]
        if (raw === undefined || raw === '') return null
        const contagem = parseFloat(raw.replace(',', '.'))
        if (isNaN(contagem)) return null
        const diferenca = contagem - Number(produto.estoque_atual)
        return { contagem, diferenca }
    }

    function handleLimparContagens() {
        setContagens({})
        toast.info('Contagens limpas')
    }

    async function handleSalvarInventario() {
        if (divergencias.length === 0) {
            toast.info('Nenhuma divergência encontrada para salvar.')
            return
        }

        setSalvando(true)
        try {
            const dataAtual = new Date().toISOString()

            for (const { produto, contagem, diferenca } of divergencias) {
                const quantidadeMovimento = Math.abs(diferenca)

                const { error: movErr } = await supabase
                    .from('movimentacao_estoque')
                    .insert({
                        produto_id: produto.id,
                        tipo: 'ajuste',
                        quantidade: quantidadeMovimento,
                        observacao: `Inventário: ${Number(produto.estoque_atual)} → ${contagem} (${diferenca > 0 ? '+' : ''}${diferenca})`,
                    })
                if (movErr) throw movErr

                const { error: prodErr } = await supabase
                    .from('produtos')
                    .update({
                        estoque_atual: contagem,
                        updated_at: dataAtual,
                    })
                    .eq('id', produto.id)
                if (prodErr) throw prodErr
            }

            toast.success(`Inventário salvo! ${divergencias.length} ajuste(s) registrado(s).`, { duration: 5000 })
            setContagens({})
            await fetchProdutos()
        } catch (err: any) {
            toast.error('Erro ao salvar inventário: ' + err.message)
        } finally {
            setSalvando(false)
        }
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <ClipboardCheck className="w-5 h-5 text-primary" />
                        Inventário Físico
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Registre a contagem física e o sistema comparará com o estoque do banco
                    </p>
                </div>

                {/* Info: O que é divergência */}
                <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                    <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-semibold text-blue-800">O que é divergência?</p>
                        <p className="text-blue-700 text-xs mt-0.5">
                            Divergência é a diferença entre o que você <strong>contou fisicamente</strong> e o que o <strong>sistema registra</strong>.
                            Se positiva (<span className="text-emerald-600 font-bold">+</span>), há mais produto do que o esperado (sobra).
                            Se negativa (<span className="text-red-600 font-bold">–</span>), há menos do que deveria (falta/perda).
                            Ao salvar, o estoque do sistema é ajustado para bater com a contagem real.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleLimparContagens}
                        disabled={totalPreenchidos === 0}
                        className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Undo2 className="w-3.5 h-3.5" />
                        Limpar
                    </button>
                    <button
                        onClick={handleSalvarInventario}
                        disabled={salvando || divergencias.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {salvando ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Salvar Inventário
                        {divergencias.length > 0 && (
                            <span className="bg-white/20 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                                {divergencias.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Cards de Resumo */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    {
                        label: 'Produtos Ativos',
                        value: produtos.length,
                        icon: <Package className="w-4 h-4" />,
                        color: 'bg-blue-50 text-blue-700 border-blue-100',
                    },
                    {
                        label: 'Contados',
                        value: totalPreenchidos,
                        icon: <ClipboardCheck className="w-4 h-4" />,
                        color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                    },
                    {
                        label: 'Divergências',
                        value: divergencias.length,
                        icon: <ArrowLeftRight className="w-4 h-4" />,
                        color: divergencias.length > 0
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-gray-50 text-gray-600 border-gray-100',
                    },
                    {
                        label: 'Pendentes',
                        value: produtos.length - totalPreenchidos,
                        icon: <AlertTriangle className="w-4 h-4" />,
                        color: 'bg-gray-50 text-gray-600 border-gray-100',
                    },
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

            {/* Barra de Filtro */}
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
                <div className="flex gap-2">
                    {([
                        { value: 'todos' as const, label: 'Todos' },
                        { value: 'divergentes' as const, label: `⚠ Divergentes (${divergencias.length})` },
                    ]).map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setFiltroDiv(f.value)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${filtroDiv === f.value
                                ? f.value === 'divergentes'
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-primary border-primary text-white'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabela de Inventário */}
            {loading ? (
                <div className="flex justify-center p-16">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            ) : produtosFiltrados.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 flex flex-col items-center text-gray-400">
                    <Package className="w-12 h-12 mb-3 opacity-20" />
                    <p className="font-medium">Nenhum produto encontrado</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/80 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-5 py-3 font-semibold">Produto</th>
                                    <th className="px-5 py-3 font-semibold">Categoria</th>
                                    <th className="px-5 py-3 font-semibold text-right">Estoque Sistema</th>
                                    <th className="px-5 py-3 font-semibold text-center w-40">Contagem Física</th>
                                    <th className="px-5 py-3 font-semibold text-center">Diferença</th>
                                    <th className="px-5 py-3 font-semibold text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {produtosFiltrados.map((produto) => {
                                    const info = getDiferenca(produto)
                                    const hasDivergencia = info !== null && info.diferenca !== 0
                                    const isSemDiferenca = info !== null && info.diferenca === 0

                                    return (
                                        <tr
                                            key={produto.id}
                                            className={`transition-colors ${hasDivergencia
                                                ? 'bg-sky-50/40 hover:bg-sky-50/70'
                                                : isSemDiferenca
                                                    ? 'bg-emerald-50/30 hover:bg-emerald-50/50'
                                                    : 'hover:bg-gray-50/50'
                                                }`}
                                        >
                                            {/* Produto */}
                                            <td className="px-5 py-3">
                                                <p className="font-semibold text-gray-800">{produto.nome}</p>
                                                <p className="text-xs text-gray-400">
                                                    {produto.tipo === 'proprio' ? 'Produção Própria' : 'Insumo'}
                                                </p>
                                            </td>
                                            {/* Categoria */}
                                            <td className="px-5 py-3">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-600">
                                                    {produto.categoria}
                                                </span>
                                            </td>
                                            {/* Estoque Sistema */}
                                            <td className="px-5 py-3 text-right">
                                                <span className="font-extrabold text-base text-gray-800">
                                                    {Number(produto.estoque_atual).toLocaleString('pt-BR')}
                                                </span>
                                                <span className="text-xs text-gray-400 ml-1">{produto.unidade_medida}</span>
                                            </td>
                                            {/* Contagem Física */}
                                            <td className="px-5 py-3">
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.001"
                                                        placeholder="—"
                                                        value={contagens[produto.id] ?? ''}
                                                        onChange={(e) => handleContagemChange(produto.id, e.target.value)}
                                                        className={`w-full px-3 py-2 border rounded-lg text-sm font-semibold text-center outline-none transition-colors ${hasDivergencia
                                                            ? 'border-sky-300 bg-sky-50 focus:ring-2 focus:ring-sky-200'
                                                            : isSemDiferenca
                                                                ? 'border-emerald-300 bg-emerald-50 focus:ring-2 focus:ring-emerald-200'
                                                                : 'border-gray-200 focus:ring-2 focus:ring-blue-200'
                                                            }`}
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                                        {produto.unidade_medida}
                                                    </span>
                                                </div>
                                            </td>
                                            {/* Diferença */}
                                            <td className="px-5 py-3 text-center">
                                                {info === null ? (
                                                    <span className="text-xs text-gray-300">—</span>
                                                ) : info.diferenca === 0 ? (
                                                    <span className="text-xs font-bold text-emerald-600">0</span>
                                                ) : (
                                                    <span className={`text-sm font-extrabold ${info.diferenca > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {info.diferenca > 0 ? '+' : ''}{info.diferenca.toLocaleString('pt-BR')}
                                                    </span>
                                                )}
                                            </td>
                                            {/* Status */}
                                            <td className="px-5 py-3 text-center">
                                                {info === null ? (
                                                    <span className="text-xs text-gray-300">Pendente</span>
                                                ) : info.diferenca === 0 ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase">
                                                        <CheckCircle2 className="w-2.5 h-2.5" /> OK
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full text-[10px] font-bold uppercase">
                                                        <AlertTriangle className="w-2.5 h-2.5" /> Divergente
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-50 flex items-center justify-between text-xs text-gray-400">
                        <span>
                            {produtosFiltrados.length} de {produtos.length} produto{produtos.length !== 1 ? 's' : ''}
                        </span>
                        {divergencias.length > 0 && (
                            <span className="text-sky-600 font-semibold">
                                ⚠ {divergencias.length} divergência{divergencias.length !== 1 ? 's' : ''} detectada{divergencias.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
