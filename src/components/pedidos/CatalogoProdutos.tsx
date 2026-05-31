'use client'

import { useState } from 'react'
import { Plus, Scale, Grid, Coffee, Cookie, Sandwich, Croissant, Package, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 25
import type { Produto } from '@/lib/types'

// Estilo pastel por categoria — fundo (não selecionado), fundo intensificado
// (selecionado) e ícone Lucide. Categorias fora da lista caem no fallback slate.
const CATEGORIA_STYLE: Record<string, { bg: string; bgActive: string; text: string; icon: React.ElementType }> = {
    'Todos':    { bg: 'bg-slate-100',  bgActive: 'bg-slate-300',  text: 'text-slate-800',   icon: Grid },
    'Bebidas':  { bg: 'bg-sky-100',    bgActive: 'bg-sky-200',    text: 'text-sky-800',     icon: Coffee },
    'Doces':    { bg: 'bg-pink-50',    bgActive: 'bg-pink-200',   text: 'text-pink-800',    icon: Cookie },
    'Lanches':  { bg: 'bg-amber-50',   bgActive: 'bg-amber-200',  text: 'text-amber-800',   icon: Sandwich },
    'Salgados': { bg: 'bg-orange-50',  bgActive: 'bg-orange-200', text: 'text-orange-800',  icon: Croissant },
    'Outros':   { bg: 'bg-gray-100',   bgActive: 'bg-gray-300',   text: 'text-gray-800',    icon: Package },
}
const CATEGORIA_FALLBACK = { bg: 'bg-slate-100', bgActive: 'bg-slate-300', text: 'text-slate-800', icon: Package }

interface CatalogoProdutosProps {
    produtos: Produto[]
    onAddProduto: (produto: Produto) => void
    /** Quando true, esconde o título "3. Catálogo de Produtos" (caller já renderiza o cabeçalho). */
    hideHeader?: boolean
}

export default function CatalogoProdutos({ produtos, onAddProduto, hideHeader }: CatalogoProdutosProps) {
    // Extrai categorias únicas, começa com 'Todos'
    const categorias = ['Todos', ...Array.from(new Set(
        produtos.map((p) => p.categoria ?? 'Sem Categoria')
    )).sort()]

    const [abaAtiva, setAbaAtiva] = useState('Todos')
    const [busca, setBusca] = useState('')
    const [pagina, setPagina] = useState(1)

    // Contagem por categoria — deixa explícito que o filtro mudou (ex: Bebidas é
    // ~metade do catálogo, então Todos↔Bebidas parecia "não mudar").
    const contagemCategoria = (cat: string) =>
        cat === 'Todos'
            ? produtos.length
            : produtos.filter((p) => (p.categoria ?? 'Sem Categoria') === cat).length

    const produtosFiltrados = produtos.filter((p) => {
        const matchCategoria = abaAtiva === 'Todos' || (p.categoria ?? 'Sem Categoria') === abaAtiva
        const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase())
        return matchCategoria && matchBusca
    })

    // Paginação — 25 por página por categoria (carregamento leve/rápido)
    const totalPaginas = Math.max(1, Math.ceil(produtosFiltrados.length / PAGE_SIZE))
    const paginaAtual = Math.min(pagina, totalPaginas)
    const produtosPagina = produtosFiltrados.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE)

    // Troca de categoria/busca volta pra página 1
    const trocarCategoria = (cat: string) => { setAbaAtiva(cat); setPagina(1) }
    const trocarBusca = (v: string) => { setBusca(v); setPagina(1) }

    return (
        <div className="flex flex-col gap-4 h-full">
            {!hideHeader && (
                <p className="text-sm font-semibold text-gray-700">3. Catálogo de Produtos</p>
            )}

            {/* Busca rápida */}
            <input
                type="search"
                placeholder="Buscar produto..."
                value={busca}
                onChange={(e) => trocarBusca(e.target.value)}
                className="h-11 w-full px-4 rounded-xl border border-blue-100 bg-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/40"
            />

            {/* Abas por categoria — pastel + ícone, intensifica quando ativa */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                {categorias.map((cat) => {
                    const style = CATEGORIA_STYLE[cat] ?? CATEGORIA_FALLBACK
                    const Icon = style.icon
                    const isActive = abaAtiva === cat
                    return (
                        <button
                            key={cat}
                            onClick={() => trocarCategoria(cat)}
                            className={`shrink-0 h-9 px-3 rounded-full text-sm transition-all duration-200 touch-manipulation
                                inline-flex items-center gap-1.5
                                ${isActive
                                    ? `${style.bgActive} ${style.text} font-bold shadow-sm`
                                    : `${style.bg} ${style.text} font-medium opacity-80 hover:opacity-100`
                                }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {cat}
                            <span className={`ml-0.5 text-[11px] font-bold ${isActive ? 'opacity-90' : 'opacity-50'}`}>
                                {contagemCategoria(cat)}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* Grid de produtos */}
            {produtosFiltrados.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2 py-10">
                    <span className="text-4xl">🥐</span>
                    <p className="text-sm">Nenhum produto encontrado</p>
                </div>
            ) : (
                <div key={`${abaAtiva}-${paginaAtual}`} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto pr-1">
                    {produtosPagina.map((produto) => {
                        const isPesado = (produto.unidade_medida ?? '').toLowerCase() === 'kg'
                        return (
                            <button
                                key={produto.id}
                                onClick={() => onAddProduto(produto)}
                                className={`group flex flex-col items-start gap-1.5 p-3 rounded-2xl bg-white border
                                       text-left active:scale-95 transition-all touch-manipulation
                                       hover:shadow-md min-h-[80px] ${isPesado
                                        ? 'border-emerald-200 hover:border-emerald-400'
                                        : 'border-blue-100 hover:border-primary/40'
                                    }`}
                            >
                                {/* Placeholder visual + badge kg */}
                                <div className={`w-full h-14 rounded-xl flex items-center justify-center text-2xl mb-0.5 relative ${isPesado
                                    ? 'bg-gradient-to-br from-emerald-50 to-emerald-100'
                                    : 'bg-gradient-to-br from-blue-50 to-blue-100'
                                    }`}>
                                    {isPesado ? '⚖️' : '🥐'}
                                    {isPesado && (
                                        <span className="absolute top-1 right-1 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-0.5">
                                            <Scale className="w-2.5 h-2.5" />
                                            kg
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">
                                    {produto.nome}
                                </p>
                                <div className="flex items-center justify-between w-full mt-auto">
                                    <span className={`text-base font-bold ${isPesado ? 'text-emerald-700' : 'text-primary'}`}>
                                        {new Intl.NumberFormat('pt-BR', {
                                            style: 'currency',
                                            currency: 'BRL',
                                        }).format(Number(produto.preco))}
                                        {isPesado && (
                                            <span className="text-[10px] font-medium opacity-70 ml-0.5">/kg</span>
                                        )}
                                    </span>
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center
                                                group-active:scale-90 transition-transform ${isPesado ? 'bg-emerald-600' : 'bg-primary'
                                        }`}>
                                        {isPesado
                                            ? <Scale className="w-4 h-4 text-white" />
                                            : <Plus className="w-4 h-4 text-white" />
                                        }
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Paginação — 25 por página */}
            {totalPaginas > 1 && (
                <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                        type="button"
                        onClick={() => setPagina((p) => Math.max(1, p - 1))}
                        disabled={paginaAtual <= 1}
                        className="w-9 h-9 rounded-lg border border-blue-100 bg-white flex items-center justify-center
                                   text-primary hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Página anterior"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold text-gray-500">
                        Página {paginaAtual} de {totalPaginas}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                        disabled={paginaAtual >= totalPaginas}
                        className="w-9 h-9 rounded-lg border border-blue-100 bg-white flex items-center justify-center
                                   text-primary hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label="Próxima página"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    )
}
