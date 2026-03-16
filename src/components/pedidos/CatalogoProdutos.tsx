'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Produto } from '@/lib/types'

interface CatalogoProdutosProps {
    produtos: Produto[]
    onAddProduto: (produto: Produto) => void
}

export default function CatalogoProdutos({ produtos, onAddProduto }: CatalogoProdutosProps) {
    // Extrai categorias únicas, começa com 'Todos'
    const categorias = ['Todos', ...Array.from(new Set(
        produtos.map((p) => p.categoria ?? 'Sem Categoria')
    )).sort()]

    const [abaAtiva, setAbaAtiva] = useState('Todos')
    const [busca, setBusca] = useState('')

    const produtosFiltrados = produtos.filter((p) => {
        const matchCategoria = abaAtiva === 'Todos' || (p.categoria ?? 'Sem Categoria') === abaAtiva
        const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase())
        return matchCategoria && matchBusca
    })

    return (
        <div className="flex flex-col gap-4 h-full">
            <p className="text-sm font-semibold text-gray-700">3. Catálogo de Produtos</p>

            {/* Busca rápida */}
            <input
                type="search"
                placeholder="Buscar produto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-11 w-full px-4 rounded-xl border border-blue-100 bg-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
            />

            {/* Abas por categoria */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                {categorias.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setAbaAtiva(cat)}
                        className={`shrink-0 h-9 px-4 rounded-full text-sm font-medium transition-all touch-manipulation
                            ${abaAtiva === cat
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-white border border-blue-100 text-gray-600 hover:border-primary hover:text-primary'
                            }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Grid de produtos */}
            {produtosFiltrados.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2 py-10">
                    <span className="text-4xl">🥐</span>
                    <p className="text-sm">Nenhum produto encontrado</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto pr-1">
                    {produtosFiltrados.map((produto) => (
                        <button
                            key={produto.id}
                            onClick={() => onAddProduto(produto)}
                            className="group flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border
                                       border-blue-100 text-left active:scale-95 transition-all touch-manipulation
                                       hover:border-primary/40 hover:shadow-md min-h-[80px]"
                        >
                            {/* Placeholder visual (sem imagem no banco) */}
                            <div className="w-full h-14 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100
                                            flex items-center justify-center text-2xl mb-0.5">
                                🥐
                            </div>
                            <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">
                                {produto.nome}
                            </p>
                            <div className="flex items-center justify-between w-full mt-auto">
                                <span className="text-base font-bold text-primary">
                                    {new Intl.NumberFormat('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                    }).format(Number(produto.preco))}
                                </span>
                                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center
                                                group-active:scale-90 transition-transform">
                                    <Plus className="w-4 h-4 text-white" />
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
