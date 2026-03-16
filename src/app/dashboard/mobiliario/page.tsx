'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
    Building2, Search, Plus, Edit2, Trash2, Save, X,
    Loader2, Package, DollarSign, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import { toast } from 'sonner'

interface ItemMobiliario {
    id: string
    nome: string
    marca: string | null
    quantidade: number
    valor: number
    condicao: 'novo' | 'usado'
    observacao: string | null
    created_at: string
    updated_at: string
}

type FiltroCondicao = 'todos' | 'novo' | 'usado'

// ── Modal de Cadastro/Edição ──────────────────────────────────────────────
function ModalMobiliario({
    item,
    onClose,
    onSuccess,
}: {
    item?: ItemMobiliario | null
    onClose: () => void
    onSuccess: () => void
}) {
    const [nome, setNome] = useState(item?.nome ?? '')
    const [marca, setMarca] = useState(item?.marca ?? '')
    const [quantidade, setQuantidade] = useState(String(item?.quantidade ?? 1))
    const [valor, setValor] = useState(String(item?.valor ?? ''))
    const [condicao, setCondicao] = useState<'novo' | 'usado'>(item?.condicao ?? 'novo')
    const [observacao, setObservacao] = useState(item?.observacao ?? '')
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!nome.trim()) { toast.error('Nome é obrigatório'); return }

        setLoading(true)
        try {
            const payload = {
                nome: nome.trim(),
                marca: marca.trim() || null,
                quantidade: parseInt(quantidade) || 1,
                valor: parseFloat(valor) || 0,
                condicao,
                observacao: observacao.trim() || null,
                updated_at: new Date().toISOString(),
            }

            if (item) {
                const { error } = await supabase
                    .from('mobiliario_empresa')
                    .update(payload)
                    .eq('id', item.id)
                if (error) throw error
                toast.success('Item atualizado com sucesso')
            } else {
                const { error } = await supabase
                    .from('mobiliario_empresa')
                    .insert(payload)
                if (error) throw error
                toast.success('Item cadastrado com sucesso')
            }

            onSuccess()
            onClose()
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                        <h2 className="font-bold text-gray-800">
                            {item ? 'Editar Item' : 'Novo Item Mobiliário'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Nome */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Nome do Item <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            placeholder="Ex: Forno Industrial, Geladeira, Balcão..."
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            autoFocus
                        />
                    </div>

                    {/* Marca + Quantidade */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Marca</label>
                            <input
                                type="text"
                                value={marca}
                                onChange={(e) => setMarca(e.target.value)}
                                placeholder="Ex: Tramontina"
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Quantidade</label>
                            <input
                                type="number"
                                min="1"
                                value={quantidade}
                                onChange={(e) => setQuantidade(e.target.value)}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            />
                        </div>
                    </div>

                    {/* Valor + Condição */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Valor (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                placeholder="0,00"
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Condição</label>
                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setCondicao('novo')}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all ${condicao === 'novo'
                                        ? 'bg-emerald-600 border-emerald-600 text-white'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
                                        }`}
                                >
                                    Novo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCondicao('usado')}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition-all ${condicao === 'usado'
                                        ? 'bg-sky-600 border-sky-600 text-white'
                                        : 'bg-white border-gray-200 text-gray-600 hover:border-sky-300'
                                        }`}
                                >
                                    Usado
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Observação */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Observação</label>
                        <textarea
                            rows={2}
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            placeholder="Notas sobre o item, localização, etc..."
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                        />
                    </div>

                    {/* Ações */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                            ) : (
                                <><Save className="w-4 h-4" /> {item ? 'Salvar' : 'Cadastrar'}</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ── Página Principal ─────────────────────────────────────────────────────────
export default function MobiliarioPage() {
    const [itens, setItens] = useState<ItemMobiliario[]>([])
    const [loading, setLoading] = useState(true)
    const [busca, setBusca] = useState('')
    const [filtro, setFiltro] = useState<FiltroCondicao>('todos')
    const [modalItem, setModalItem] = useState<ItemMobiliario | null | undefined>(undefined)
    const supabase = createClient()

    const fetchItens = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('mobiliario_empresa')
            .select('*')
            .order('nome', { ascending: true })
        if (error) toast.error('Erro ao carregar mobiliário')
        else setItens((data ?? []) as ItemMobiliario[])
        setLoading(false)
    }, [supabase])

    useEffect(() => { fetchItens() }, [fetchItens])

    const stats = useMemo(() => ({
        total: itens.length,
        qtdTotal: itens.reduce((acc, i) => acc + i.quantidade, 0),
        valorTotal: itens.reduce((acc, i) => acc + i.valor * i.quantidade, 0),
        novos: itens.filter(i => i.condicao === 'novo').length,
        usados: itens.filter(i => i.condicao === 'usado').length,
    }), [itens])

    const itensFiltrados = useMemo(() => {
        return itens.filter((i) => {
            const matchBusca = !busca ||
                i.nome.toLowerCase().includes(busca.toLowerCase()) ||
                (i.marca?.toLowerCase() ?? '').includes(busca.toLowerCase())
            const matchFiltro = filtro === 'todos' ? true : i.condicao === filtro
            return matchBusca && matchFiltro
        })
    }, [itens, busca, filtro])

    async function handleDelete(id: string, nome: string) {
        if (!confirm(`Tem certeza que deseja excluir "${nome}"?`)) return
        const { error } = await supabase.from('mobiliario_empresa').delete().eq('id', id)
        if (error) toast.error('Erro ao excluir: ' + error.message)
        else { toast.success('Item excluído'); fetchItens() }
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-blue-600" />
                        Inventário Mobiliário
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Bens físicos da empresa: equipamentos, mobília, utensílios</p>
                </div>
                <button
                    onClick={() => setModalItem(null)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Novo Item
                </button>
            </div>

            {/* Cards de Estatísticas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Itens Cadastrados', value: stats.total, icon: <Package className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { label: 'Quantidade Total', value: stats.qtdTotal, icon: <Building2 className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { label: 'Valor Patrimonial', value: formatCurrency(stats.valorTotal), icon: <DollarSign className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { label: 'Novos / Usados', value: `${stats.novos} / ${stats.usados}`, icon: <CheckCircle2 className="w-4 h-4" />, color: 'bg-gray-50 text-gray-600 border-gray-100' },
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
                        placeholder="Buscar por nome ou marca..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    {([
                        { value: 'todos' as const, label: 'Todos' },
                        { value: 'novo' as const, label: 'Novos' },
                        { value: 'usado' as const, label: 'Usados' },
                    ]).map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setFiltro(f.value)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${filtro === f.value
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabela */}
            {loading ? (
                <div className="flex justify-center p-16">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : itensFiltrados.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 flex flex-col items-center text-gray-400">
                    <Building2 className="w-12 h-12 mb-3 opacity-20" />
                    <p className="font-medium">Nenhum item encontrado</p>
                    <p className="text-sm mt-1">Cadastre equipamentos, mobília e utensílios da empresa.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/80 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-5 py-3 font-semibold">Nome</th>
                                    <th className="px-5 py-3 font-semibold">Marca</th>
                                    <th className="px-5 py-3 font-semibold text-center">Qtd</th>
                                    <th className="px-5 py-3 font-semibold text-right">Valor Un.</th>
                                    <th className="px-5 py-3 font-semibold text-right">Valor Total</th>
                                    <th className="px-5 py-3 font-semibold text-center">Condição</th>
                                    <th className="px-5 py-3 font-semibold">Observação</th>
                                    <th className="px-5 py-3 font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {itensFiltrados.map((item) => (
                                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="px-5 py-3 font-semibold text-gray-800">{item.nome}</td>
                                        <td className="px-5 py-3 text-gray-600">{item.marca || '—'}</td>
                                        <td className="px-5 py-3 text-center font-bold text-gray-800">{item.quantidade}</td>
                                        <td className="px-5 py-3 text-right text-gray-600">{formatCurrency(item.valor)}</td>
                                        <td className="px-5 py-3 text-right font-bold text-gray-800">
                                            {formatCurrency(item.valor * item.quantidade)}
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${item.condicao === 'novo'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-sky-100 text-sky-700'
                                                }`}>
                                                {item.condicao === 'novo' ? 'Novo' : 'Usado'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-500 text-xs max-w-48 truncate" title={item.observacao || ''}>
                                            {item.observacao || '—'}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => setModalItem(item)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id, item.nome)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Excluir"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-5 py-3 border-t border-gray-50 text-xs text-gray-400">
                        {itensFiltrados.length} de {itens.length} ite{itens.length !== 1 ? 'ns' : 'm'}
                    </div>
                </div>
            )}

            {/* Modal */}
            {modalItem !== undefined && (
                <ModalMobiliario
                    item={modalItem}
                    onClose={() => setModalItem(undefined)}
                    onSuccess={fetchItens}
                />
            )}
        </div>
    )
}
