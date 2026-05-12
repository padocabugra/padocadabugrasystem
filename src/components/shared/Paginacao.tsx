'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginacaoProps {
    paginaAtual: number
    totalPaginas: number
    totalItens: number
    itensPorPagina: number
    onMudarPagina: (pagina: number) => void
}

export default function Paginacao({
    paginaAtual,
    totalPaginas,
    totalItens,
    itensPorPagina,
    onMudarPagina,
}: PaginacaoProps) {
    if (totalPaginas <= 1) return null

    const inicio = (paginaAtual - 1) * itensPorPagina + 1
    const fim = Math.min(paginaAtual * itensPorPagina, totalItens)

    // Gera range de páginas visíveis (máx 5)
    function getRange(): number[] {
        const maxVisible = 5
        let start = Math.max(1, paginaAtual - Math.floor(maxVisible / 2))
        const end = Math.min(totalPaginas, start + maxVisible - 1)
        start = Math.max(1, end - maxVisible + 1)
        const pages: number[] = []
        for (let i = start; i <= end; i++) pages.push(i)
        return pages
    }

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-3">
            <p className="text-xs text-gray-500">
                Mostrando <span className="font-bold text-gray-700">{inicio}–{fim}</span> de{' '}
                <span className="font-bold text-gray-700">{totalItens}</span> registros
            </p>

            <div className="flex items-center gap-1">
                <button
                    onClick={() => onMudarPagina(paginaAtual - 1)}
                    disabled={paginaAtual <= 1}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Página anterior"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>

                {getRange().map((pg) => (
                    <button
                        key={pg}
                        onClick={() => onMudarPagina(pg)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                            pg === paginaAtual
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        {pg}
                    </button>
                ))}

                <button
                    onClick={() => onMudarPagina(paginaAtual + 1)}
                    disabled={paginaAtual >= totalPaginas}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Próxima página"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

/**
 * Hook para paginação de arrays client-side.
 * @param items Array completo de itens já filtrados
 * @param itensPorPagina Itens por página (default: 15)
 */
export function usePaginacao<T>(items: T[], itensPorPagina = 15) {
    const totalItens = items.length
    const totalPaginas = Math.max(1, Math.ceil(totalItens / itensPorPagina))

    return {
        paginar: (pagina: number) => {
            const inicio = (pagina - 1) * itensPorPagina
            return items.slice(inicio, inicio + itensPorPagina)
        },
        totalPaginas,
        totalItens,
        itensPorPagina,
    }
}
