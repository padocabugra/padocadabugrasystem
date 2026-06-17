'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Search, Archive, Package, FileCheck, AlertCircle, ChefHat, CheckSquare, Square, X as IconX, Eye, EyeOff, ScanLine, MousePointerClick, Trash2, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency, isValidEAN13 } from '@/lib/formatters'
import { toast } from 'sonner'
import ModalProduto from '@/components/produtos/ModalProduto'
import ModalImprimirEtiquetas from '@/components/produtos/ModalImprimirEtiquetas'
import { registrarAuditLog } from '@/lib/audit-log'
import type { Produto } from '@/lib/types/produto'

type FiltroDisponivel = 'todos' | 'venda' | 'insumo' | 'sem_codigo'

export default function ProdutosPage() {
    const [produtos, setProdutos] = useState<Produto[]>([])
    const [produtosEmReceita, setProdutosEmReceita] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [filtroDisponivel, setFiltroDisponivel] = useState<FiltroDisponivel>('todos')
    const [togglingId, setTogglingId] = useState<string | null>(null)
    const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
    const [bulkUpdating, setBulkUpdating] = useState(false)
    // Modo seleção opt-in: default false → tabela limpa (sem coluna checkbox).
    // Quando true: coluna checkbox aparece + barra de ações em massa fica disponível.
    const [modoSelecao, setModoSelecao] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    // Estado do modal
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingProduto, setEditingProduto] = useState<Produto | null>(null)
    // Modal de impressão de etiquetas (null = fechado; array = produtos a imprimir)
    const [etiquetasProdutos, setEtiquetasProdutos] = useState<Produto[] | null>(null)

    const debouncedSearch = useDebounce(searchTerm, 400)

    const fetchProdutos = useCallback(async () => {
        setLoading(true)
        const supabase = createClient()
        let query = supabase
            .from('produtos')
            .select('*')
            .order('nome', { ascending: true })

        if (debouncedSearch) {
            // Filtrar por nome ou categoria
            // ilike para case insensitive na busca
            // Buscamos se o termo bate no nome OU na categoria
            query = query.or(`nome.ilike.%${debouncedSearch}%,categoria.ilike.%${debouncedSearch}%`)
        }

        const [produtosRes, receitasRes] = await Promise.all([
            query,
            supabase.from('receitas').select('ingredientes'),
        ])

        if (produtosRes.error) {
            console.error('Erro ao buscar produtos:', produtosRes.error)
        } else {
            setProdutos(produtosRes.data as Produto[])
        }

        if (!receitasRes.error && receitasRes.data) {
            // Extrai produto_id de todos os ingredientes de todas as receitas (jsonb)
            const ids = new Set<string>()
            for (const r of receitasRes.data as Array<{ ingredientes: unknown }>) {
                const ings = Array.isArray(r.ingredientes) ? r.ingredientes : []
                for (const ing of ings as Array<{ produto_id?: string }>) {
                    if (ing?.produto_id) ids.add(ing.produto_id)
                }
            }
            setProdutosEmReceita(ids)
        }

        setLoading(false)
    }, [debouncedSearch])

    useEffect(() => {
        fetchProdutos()
    }, [fetchProdutos])

    // Limpa seleção quando o filtro muda (evita confusão com itens fora da view)
    useEffect(() => {
        setSelecionados(new Set())
    }, [filtroDisponivel, debouncedSearch])

    function sairModoSelecao() {
        setModoSelecao(false)
        setSelecionados(new Set())
    }

    function handleNovo() {
        setEditingProduto(null)
        setIsModalOpen(true)
    }

    function handleEditar(produto: Produto) {
        setEditingProduto(produto)
        setIsModalOpen(true)
    }

    function closeModal() {
        setIsModalOpen(false)
        setEditingProduto(null)
    }

    async function handleToggleDisponivel(produto: Produto, e: React.MouseEvent) {
        e.stopPropagation()
        const novoValor = !produto.disponivel_venda
        setTogglingId(produto.id)
        // Otimista
        setProdutos((prev) => prev.map((p) => (p.id === produto.id ? { ...p, disponivel_venda: novoValor } : p)))
        const supabase = createClient()
        const { error } = await supabase
            .from('produtos')
            .update({ disponivel_venda: novoValor, updated_at: new Date().toISOString() })
            .eq('id', produto.id)
        setTogglingId(null)
        if (error) {
            // Reverte em caso de erro
            setProdutos((prev) => prev.map((p) => (p.id === produto.id ? { ...p, disponivel_venda: !novoValor } : p)))
            toast.error('Erro ao atualizar disponibilidade: ' + error.message)
        } else {
            toast.success(novoValor ? 'Produto disponível para venda' : 'Marcado como insumo')
        }
    }

    const produtosFiltrados = useMemo(() => {
        if (filtroDisponivel === 'todos') return produtos
        if (filtroDisponivel === 'venda') return produtos.filter((p) => p.disponivel_venda !== false)
        if (filtroDisponivel === 'sem_codigo') return produtos.filter((p) => !p.codigo || p.codigo.trim() === '')
        return produtos.filter((p) => p.disponivel_venda === false)
    }, [produtos, filtroDisponivel])

    const produtosSemCodigo = useMemo(() => {
        return produtos.filter((p) => !p.codigo || p.codigo.trim() === '').length
    }, [produtos])

    function toggleSelecionado(id: string, e: React.MouseEvent | React.ChangeEvent) {
        e.stopPropagation()
        setSelecionados((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const todosVisiveisSelecionados = produtosFiltrados.length > 0
        && produtosFiltrados.every((p) => selecionados.has(p.id))

    function toggleSelecionarTodosVisiveis() {
        if (todosVisiveisSelecionados) {
            // Remove só os visíveis da seleção
            setSelecionados((prev) => {
                const next = new Set(prev)
                produtosFiltrados.forEach((p) => next.delete(p.id))
                return next
            })
        } else {
            setSelecionados((prev) => {
                const next = new Set(prev)
                produtosFiltrados.forEach((p) => next.add(p.id))
                return next
            })
        }
    }

    function selecionarCandidatosInsumo() {
        // Atalho: seleciona produtos visíveis que aparecem como ingrediente em receita
        // E que ainda estão marcados como "disponível para venda" (candidatos a marcar como insumo)
        setSelecionados((prev) => {
            const next = new Set(prev)
            produtosFiltrados
                .filter((p) => produtosEmReceita.has(p.id) && p.disponivel_venda !== false)
                .forEach((p) => next.add(p.id))
            return next
        })
    }

    async function handleBulkSetDisponivel(novoValor: boolean) {
        const ids = Array.from(selecionados)
        if (ids.length === 0) return

        const acao = novoValor ? 'disponíveis para venda' : 'uso interno'
        if (!confirm(`Marcar ${ids.length} produto(s) como ${acao}?`)) return

        setBulkUpdating(true)
        // Otimista
        setProdutos((prev) => prev.map((p) =>
            selecionados.has(p.id) ? { ...p, disponivel_venda: novoValor } : p
        ))

        const supabase = createClient()
        const { error } = await supabase
            .from('produtos')
            .update({ disponivel_venda: novoValor, updated_at: new Date().toISOString() })
            .in('id', ids)

        setBulkUpdating(false)

        if (error) {
            toast.error('Erro na ação em massa: ' + error.message)
            // Refetch pra reverter estado otimista de forma confiável
            fetchProdutos()
        } else {
            toast.success(`${ids.length} produto(s) marcado(s) como ${acao}`)
            setSelecionados(new Set())
        }
    }

    const candidatosInsumoVisiveis = useMemo(() => {
        return produtosFiltrados.filter(
            (p) => produtosEmReceita.has(p.id) && p.disponivel_venda !== false
        ).length
    }, [produtosFiltrados, produtosEmReceita])

    // Snapshot dos produtos selecionados (pra modal de confirmação + audit log)
    const produtosSelecionadosSnapshot = useMemo(
        () => produtos.filter((p) => selecionados.has(p.id)),
        [produtos, selecionados]
    )

    async function handleBulkDelete() {
        const ids = Array.from(selecionados)
        if (ids.length === 0) return
        setBulkUpdating(true)

        const supabase = createClient()
        const { error } = await supabase.from('produtos').delete().in('id', ids)

        setBulkUpdating(false)
        setConfirmDelete(false)

        if (error) {
            // Erros comuns: FK em pedidos/receitas. Mostra mensagem do banco pra orientar.
            toast.error('Erro ao excluir: ' + error.message, {
                description: 'Produtos vinculados a pedidos/receitas não podem ser excluídos. Marque como Uso Interno em vez disso.',
                duration: 8000,
            })
            return
        }

        // Audit log: registra deleção em lote (best-effort, não bloqueia UI)
        produtosSelecionadosSnapshot.forEach((p) => {
            registrarAuditLog({
                acao: 'produto.deletar',
                entidade: 'produtos',
                entidade_id: p.id,
                detalhes: { nome: p.nome, categoria: p.categoria, codigo: p.codigo, bulk: true },
            })
        })

        toast.success(`${ids.length} produto(s) excluído(s)`)
        setSelecionados(new Set())
        fetchProdutos()
    }

    return (
        <div className="space-y-6">
            {/* Header com Busca e Botão Novo */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Package className="w-6 h-6 text-primary" />
                        Produtos
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gerencie seu catálogo e estoque</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar produto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm w-full sm:w-64 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                        />
                    </div>
                    {modoSelecao ? (
                        <button
                            onClick={sairModoSelecao}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
                        >
                            <IconX className="w-4 h-4" />
                            Sair da Seleção
                        </button>
                    ) : (
                        <button
                            onClick={() => setModoSelecao(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-primary text-primary hover:bg-primary/5 rounded-lg text-sm font-semibold transition-colors"
                        >
                            <MousePointerClick className="w-4 h-4" />
                            Selecionar
                        </button>
                    )}
                    <button
                        onClick={handleNovo}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Produto
                    </button>
                </div>
            </div>

            {/* Tabs de filtro disponibilidade + atalho candidatos a insumo */}
            <div className="flex gap-2 flex-wrap items-center">
                {([
                    { value: 'todos' as const, label: 'Todos' },
                    { value: 'venda' as const, label: 'Para venda' },
                    { value: 'insumo' as const, label: 'Uso Interno' },
                    { value: 'sem_codigo' as const, label: produtosSemCodigo > 0 ? `Sem código (${produtosSemCodigo})` : 'Sem código' },
                ]).map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setFiltroDisponivel(f.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filtroDisponivel === f.value
                            ? 'bg-primary border-primary text-white'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                            }`}
                    >
                        {f.label}
                    </button>
                ))}

                {modoSelecao && candidatosInsumoVisiveis > 0 && (
                    <button
                        onClick={selecionarCandidatosInsumo}
                        title="Seleciona produtos que aparecem como ingrediente em alguma receita e ainda estão marcados como 'Para venda' — candidatos a virar Uso Interno."
                        className="ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-all flex items-center gap-1.5"
                    >
                        <ChefHat className="w-3.5 h-3.5" />
                        Selecionar {candidatosInsumoVisiveis} candidato(s) a insumo
                    </button>
                )}
            </div>

            {/* Barra de ações em massa — só aparece no modo seleção COM itens marcados */}
            {modoSelecao && selecionados.size > 0 && (
                <div className="sticky top-0 z-20 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 shadow-sm">
                    <span className="text-sm font-semibold text-blue-900">
                        {selecionados.size} produto(s) selecionado(s)
                    </span>
                    <div className="flex-1" />
                    <button
                        onClick={() => handleBulkSetDisponivel(false)}
                        disabled={bulkUpdating}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-700 hover:bg-gray-800 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <EyeOff className="w-3.5 h-3.5" />
                        Marcar como Uso Interno
                    </button>
                    <button
                        onClick={() => handleBulkSetDisponivel(true)}
                        disabled={bulkUpdating}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <Eye className="w-3.5 h-3.5" />
                        Marcar como Para Venda
                    </button>
                    <button
                        onClick={() => setEtiquetasProdutos(produtosSelecionadosSnapshot)}
                        disabled={bulkUpdating}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <Tag className="w-3.5 h-3.5" />
                        Imprimir etiquetas
                    </button>
                    <button
                        onClick={() => setConfirmDelete(true)}
                        disabled={bulkUpdating}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir Selecionados
                    </button>
                    <button
                        onClick={() => setSelecionados(new Set())}
                        disabled={bulkUpdating}
                        className="px-2 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                        <IconX className="w-3.5 h-3.5" />
                        Limpar
                    </button>
                </div>
            )}

            {/* Lista de Produtos (Cards em mobile, Tabela em desktop) */}
            {loading ? (
                <div className="flex justify-center p-12">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : produtosFiltrados.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 flex flex-col items-center justify-center text-gray-500">
                    <Archive className="w-12 h-12 mb-3 text-gray-300" />
                    <p className="font-medium">Nenhum produto encontrado</p>
                    {searchTerm && <p className="text-sm mt-1">Tente buscar por outro termo</p>}
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b border-gray-100 text-gray-600 uppercase text-xs tracking-wider">
                                <tr>
                                    {modoSelecao && (
                                        <th className="pl-4 pr-2 py-4 w-10">
                                            <button
                                                type="button"
                                                onClick={toggleSelecionarTodosVisiveis}
                                                title={todosVisiveisSelecionados ? 'Desmarcar todos visíveis' : 'Selecionar todos visíveis'}
                                                className="p-1 hover:bg-gray-200 rounded transition-colors"
                                            >
                                                {todosVisiveisSelecionados
                                                    ? <CheckSquare className="w-4 h-4 text-primary" />
                                                    : <Square className="w-4 h-4 text-gray-400" />
                                                }
                                            </button>
                                        </th>
                                    )}
                                    <th className="px-4 py-4 font-semibold">Produto</th>
                                    <th className="px-3 py-4 font-semibold">Código</th>
                                    <th className="px-3 py-4 font-semibold">Categoria</th>
                                    <th className="px-3 py-4 font-semibold text-right">Preço</th>
                                    <th className="px-3 py-4 font-semibold text-right">Estoque</th>
                                    <th className="px-3 py-4 font-semibold text-center">Disp. Venda</th>
                                    <th className="px-3 py-4 font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {produtosFiltrados.map((produto) => {
                                    const estaSelecionado = selecionados.has(produto.id)
                                    const usadoEmReceita = produtosEmReceita.has(produto.id)
                                    // Em modo seleção, clique na linha alterna seleção. Fora dele, abre o modal de edição.
                                    const handleRowClick = modoSelecao
                                        ? (e: React.MouseEvent) => toggleSelecionado(produto.id, e)
                                        : () => handleEditar(produto)
                                    return (
                                    <tr
                                        key={produto.id}
                                        className={`transition-colors group cursor-pointer ${estaSelecionado ? 'bg-blue-100 hover:bg-blue-100' : 'hover:bg-blue-50/50'}`}
                                        onClick={handleRowClick}
                                    >
                                        {modoSelecao && (
                                            <td className="pl-4 pr-2 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    onClick={(e) => toggleSelecionado(produto.id, e)}
                                                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                                                >
                                                    {estaSelecionado
                                                        ? <CheckSquare className="w-4 h-4 text-primary" />
                                                        : <Square className="w-4 h-4 text-gray-300" />
                                                    }
                                                </button>
                                            </td>
                                        )}
                                        <td className="px-4 py-4 font-medium text-gray-800 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="truncate">{produto.nome}</span>
                                                {!produto.ativo && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700">
                                                        Inativo
                                                    </span>
                                                )}
                                                {produto.disponivel_venda === false && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-gray-200 text-gray-600">
                                                        Uso Interno
                                                    </span>
                                                )}
                                                {usadoEmReceita && (
                                                    <span
                                                        title="Este produto aparece como ingrediente em alguma receita"
                                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700"
                                                    >
                                                        <ChefHat className="w-3 h-3" />
                                                        Em receita
                                                    </span>
                                                )}
                                                {produto.ncm ? (
                                                    <span
                                                        title={`NCM: ${produto.ncm} | CFOP: ${produto.cfop || '5101'}`}
                                                        className="inline-flex items-center text-emerald-600 cursor-default"
                                                    >
                                                        <FileCheck className="w-3.5 h-3.5" />
                                                    </span>
                                                ) : (
                                                    <span
                                                        title="Dados fiscais pendentes — usando padrão (NCM: 21069090, CFOP: 5101/5102)"
                                                        className="inline-flex items-center text-amber-400 cursor-default"
                                                    >
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4">
                                            <CodigoCelula codigo={produto.codigo} />
                                        </td>
                                        <td className="px-3 py-4 text-gray-500">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 whitespace-nowrap">
                                                {produto.categoria}
                                            </span>
                                        </td>
                                        <td className="px-3 py-4 text-right font-medium text-gray-900 whitespace-nowrap">
                                            {formatCurrency(produto.preco)}
                                            <div className="text-[10px] text-gray-400 font-normal">
                                                Custo: {formatCurrency(produto.custo)}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-right whitespace-nowrap">
                                            <div className="flex flex-col items-end">
                                                <span
                                                    className={`font-semibold ${Number(produto.estoque_atual) <= Number(produto.estoque_minimo)
                                                        ? 'text-red-500'
                                                        : 'text-green-600'
                                                        }`}
                                                >
                                                    {produto.estoque_atual} {produto.unidade_medida}
                                                </span>
                                                {Number(produto.estoque_atual) <= Number(produto.estoque_minimo) && (
                                                    <span className="text-[10px] text-red-400 font-medium">
                                                        Baixo estoque
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-4 text-center">
                                            <button
                                                type="button"
                                                onClick={(e) => handleToggleDisponivel(produto, e)}
                                                disabled={togglingId === produto.id}
                                                title={produto.disponivel_venda !== false ? 'Disponível para venda — clique para marcar como uso interno' : 'Uso interno — clique para disponibilizar'}
                                                className="relative inline-flex disabled:opacity-50"
                                            >
                                                <span
                                                    className={`relative w-11 h-6 rounded-full transition-colors ${produto.disponivel_venda !== false
                                                        ? 'bg-emerald-500'
                                                        : 'bg-gray-300'
                                                        }`}
                                                >
                                                    <span
                                                        className={`absolute top-[2px] left-[2px] w-5 h-5 bg-white border border-gray-300 rounded-full transition-transform ${produto.disponivel_venda !== false ? 'translate-x-5' : ''
                                                            }`}
                                                    />
                                                </span>
                                            </button>
                                        </td>
                                        <td className="px-3 py-4 whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-3">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setEtiquetasProdutos([produto])
                                                    }}
                                                    title="Imprimir etiqueta de código de barras"
                                                    className="text-gray-500 hover:text-primary transition-colors"
                                                >
                                                    <Tag className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleEditar(produto)
                                                    }}
                                                    className="text-primary hover:text-primary/80 font-medium hover:underline"
                                                >
                                                    Editar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal de Create/Edit */}
            <ModalProduto
                isOpen={isModalOpen}
                onClose={closeModal}
                onSuccess={fetchProdutos} // Atualiza lista após salvar
                produtoToEdit={editingProduto}
            />

            {/* Modal de impressão de etiquetas de código de barras */}
            {etiquetasProdutos && (
                <ModalImprimirEtiquetas
                    produtos={etiquetasProdutos}
                    onClose={() => setEtiquetasProdutos(null)}
                />
            )}

            {/* Modal de confirmação — Excluir em massa */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => !bulkUpdating && setConfirmDelete(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-gray-100 bg-red-50/60">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Trash2 className="w-4 h-4 text-red-600" />
                                Excluir {selecionados.size} produto(s)?
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                A exclusão é permanente. Produtos usados em pedidos ou receitas não poderão ser excluídos — nesses casos, marque como Uso Interno.
                            </p>
                        </div>
                        <div className="p-5 max-h-[40vh] overflow-y-auto">
                            <ul className="text-sm text-gray-700 space-y-1">
                                {produtosSelecionadosSnapshot.slice(0, 20).map((p) => (
                                    <li key={p.id} className="flex items-center gap-2 truncate">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                        <span className="truncate">{p.nome}</span>
                                        <span className="text-xs text-gray-400 ml-auto shrink-0">{p.categoria}</span>
                                    </li>
                                ))}
                                {produtosSelecionadosSnapshot.length > 20 && (
                                    <li className="text-xs text-gray-400 italic pt-1">
                                        ... e mais {produtosSelecionadosSnapshot.length - 20} produto(s).
                                    </li>
                                )}
                            </ul>
                        </div>
                        <div className="px-5 py-4 bg-gray-50 flex gap-2">
                            <button
                                onClick={() => setConfirmDelete(false)}
                                disabled={bulkUpdating}
                                className="flex-1 py-2.5 text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                disabled={bulkUpdating}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                                <Trash2 className="w-4 h-4" />
                                {bulkUpdating ? 'Excluindo...' : 'Excluir definitivamente'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Renderiza o código do produto na tabela com badge visual:
// — EAN-13 válido → texto verde com ícone scan
// — qualquer outro código não-vazio → texto cinza-escuro (SKU interno)
// — vazio/null → traço cinza-claro (Bugra precisa cadastrar)
function CodigoCelula({ codigo }: { codigo?: string | null }) {
    const valor = (codigo ?? '').trim()
    if (!valor) {
        return <span className="text-gray-300 font-mono text-xs">—</span>
    }
    const ean = isValidEAN13(valor)
    return (
        <span
            className={`inline-flex items-center gap-1 font-mono text-xs ${ean ? 'text-emerald-700' : 'text-gray-600'}`}
            title={ean ? 'EAN-13 válido' : 'Código interno (SKU)'}
        >
            {ean && <ScanLine className="w-3 h-3" />}
            {valor}
        </span>
    )
}
