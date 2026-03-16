'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Archive, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/lib/formatters'
import ModalProduto from '@/components/produtos/ModalProduto'
import type { Produto } from '@/lib/types/produto'

export default function ProdutosPage() {
    const [produtos, setProdutos] = useState<Produto[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    // Estado do modal
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingProduto, setEditingProduto] = useState<Produto | null>(null)

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

        const { data, error } = await query

        if (error) {
            console.error('Erro ao buscar produtos:', error)
        } else {
            setProdutos(data as Produto[])
        }
        setLoading(false)
    }, [debouncedSearch])

    useEffect(() => {
        fetchProdutos()
    }, [fetchProdutos])

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
                    <button
                        onClick={handleNovo}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Produto
                    </button>
                </div>
            </div>

            {/* Lista de Produtos (Cards em mobile, Tabela em desktop) */}
            {loading ? (
                <div className="flex justify-center p-12">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : produtos.length === 0 ? (
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
                                    <th className="px-6 py-4 font-semibold">Produto</th>
                                    <th className="px-6 py-4 font-semibold">Categoria</th>
                                    <th className="px-6 py-4 font-semibold text-right">Preço</th>
                                    <th className="px-6 py-4 font-semibold text-right">Estoque</th>
                                    <th className="px-6 py-4 font-semibold text-center">Status</th>
                                    <th className="px-6 py-4 font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {produtos.map((produto) => (
                                    <tr
                                        key={produto.id}
                                        className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                                        onClick={() => handleEditar(produto)} // Clica na linha para editar
                                    >
                                        <td className="px-6 py-4 font-medium text-gray-800">{produto.nome}</td>
                                        <td className="px-6 py-4 text-gray-500">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                                {produto.categoria}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-gray-900">
                                            {formatCurrency(produto.preco)}
                                            <div className="text-[10px] text-gray-400 font-normal">
                                                Custo: {formatCurrency(produto.custo)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
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
                                        <td className="px-6 py-4 text-center">
                                            <span
                                                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${produto.ativo
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-red-100 text-red-700'
                                                    }`}
                                            >
                                                {produto.ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleEditar(produto)
                                                }}
                                                className="text-primary hover:text-primary/80 font-medium hover:underline"
                                            >
                                                Editar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
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
        </div>
    )
}
