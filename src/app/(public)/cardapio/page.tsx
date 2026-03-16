import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/formatters'
import { Store, Utensils, Croissant, Coffee, Cake, Sandwich } from 'lucide-react'

// Tipos locais — evita importar lib pesada no Server Component
interface Produto {
    id: string
    nome: string
    descricao: string | null
    preco: number
    categoria: string
}

// Agrupa um array de produtos por categoria
function agruparPorCategoria(produtos: Produto[]): Record<string, Produto[]> {
    return produtos.reduce((acc, p) => {
        const cat = p.categoria || 'Outros'
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(p)
        return acc
    }, {} as Record<string, Produto[]>)
}

// Ícone por categoria
function getCategoriaIcon(categoria: string) {
    switch (categoria) {
        case 'Pães': return <Store className="w-5 h-5" />
        case 'Bolos': return <Cake className="w-5 h-5" />
        case 'Salgados': return <Croissant className="w-5 h-5" />
        case 'Bebidas': return <Coffee className="w-5 h-5" />
        case 'Tortas': return <Cake className="w-5 h-5" />
        case 'Doces': return <Cake className="w-5 h-5" />
        case 'Lanches': return <Sandwich className="w-5 h-5" />
        default: return <Utensils className="w-5 h-5" />
    }
}

export const metadata = {
    title: 'Cardápio | Padoca da Bugra',
    description: 'Veja nosso cardápio completo com pães, bolos, salgados e muito mais.',
}

export default async function CardapioPage() {
    const supabase = await createClient()

    const { data } = await supabase
        .from('produtos')
        .select('id, nome, descricao, preco, categoria')
        .eq('ativo', true)
        .order('categoria', { ascending: true })
        .order('nome', { ascending: true })

    const grupos = agruparPorCategoria(data ?? [])
    const categorias = Object.keys(grupos).sort()

    return (
        <div className="min-h-screen bg-blue-50/30">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-primary text-white shadow-md shadow-blue-900/10">
                <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
                    <Store className="w-7 h-7 drop-shadow-sm" />
                    <div>
                        <h1 className="font-bold text-lg leading-tight">Padoca da Bugra</h1>
                        <p className="text-blue-100 text-xs">Cardápio Digital</p>
                    </div>
                </div>
            </header>

            <main className="max-w-lg mx-auto px-4 pb-14 pt-2">
                {categorias.length === 0 ? (
                    <div className="flex flex-col items-center justify-center pt-20 gap-3 text-secondary">
                        <Utensils className="w-12 h-12 opacity-50" />
                        <p className="text-base font-medium">Cardápio em breve!</p>
                    </div>
                ) : (
                    categorias.map((categoria) => (
                        <section key={categoria} className="mt-6">
                            {/* Título da categoria */}
                            <div className="flex items-center gap-2 mb-3 text-primary">
                                {getCategoriaIcon(categoria)}
                                <h2 className="text-sm font-bold uppercase tracking-wider">
                                    {categoria}
                                </h2>
                                <div className="flex-1 h-px bg-blue-100" />
                            </div>

                            {/* Lista de produtos */}
                            <ul className="space-y-3">
                                {grupos[categoria].map((produto) => (
                                    <li
                                        key={produto.id}
                                        className="bg-white rounded-xl p-4 shadow-sm border border-blue-50
                      flex items-start justify-between gap-3 hover:border-blue-200 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="font-semibold text-gray-800 text-sm leading-snug">
                                                {produto.nome}
                                            </p>
                                            {produto.descricao && (
                                                <p className="text-gray-500 text-xs mt-1 leading-relaxed line-clamp-2">
                                                    {produto.descricao}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="font-bold text-primary text-sm whitespace-nowrap bg-blue-50 px-2 py-1 rounded-md">
                                                {formatCurrency(produto.preco)}
                                            </span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))
                )}
            </main>

            {/* Rodapé fixo com número da mesa (se existir query param) */}
            <MesaFooter />
        </div>
    )
}

// Componente separado para evitar 'use client' na page inteira
// Lê ?mesa=X da URL via searchParams não é possível aqui sem client,
// então deixamos só o rodapé estático de branding.
function MesaFooter() {
    return (
        <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-sm border-t border-blue-100 py-3 text-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
            <p className="text-xs text-secondary font-medium">Chame um atendente para fazer seu pedido 😊</p>
        </footer>
    )
}
