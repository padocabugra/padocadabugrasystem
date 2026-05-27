'use client'

import { ShoppingCart, Plus, Minus, Trash2, ChefHat, Wallet, CookingPot, DollarSign, Scale } from 'lucide-react'
import type { ItemCarrinho } from '@/lib/types/pedidos'

interface CarrinhoLateralProps {
    itens: ItemCarrinho[]
    onAdd: (cart_item_id: string) => void
    onRemove: (cart_item_id: string) => void
    onRePesar: (cart_item_id: string) => void
    onSubmit: () => void
    isSubmitting: boolean
    destinoCozinha: boolean
    onDestinoChange: (cozinha: boolean) => void
}

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

function formatPeso(gramas: number): string {
    if (gramas >= 1000) {
        const kg = gramas / 1000
        return `${kg.toLocaleString('pt-BR', { minimumFractionDigits: kg % 1 === 0 ? 0 : 3, maximumFractionDigits: 3 })} kg`
    }
    return `${gramas} g`
}

export default function CarrinhoLateral({
    itens,
    onAdd,
    onRemove,
    onRePesar,
    onSubmit,
    isSubmitting,
    destinoCozinha,
    onDestinoChange,
}: CarrinhoLateralProps) {
    const total = itens.reduce((acc, item) => acc + item.preco * item.quantidade, 0)
    const contagemItens = itens.reduce(
        (acc, item) => acc + ((item.unidade_medida ?? '').toLowerCase() === 'kg' ? 1 : item.quantidade),
        0
    )

    return (
        <div className="flex flex-col h-full bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-blue-100 bg-blue-50/50">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <p className="font-semibold text-gray-800 text-sm">Carrinho</p>
                {itens.length > 0 && (
                    <span className="ml-auto bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {contagemItens}
                    </span>
                )}
            </div>

            {/* Lista de itens */}
            <div className="flex-1 overflow-y-auto divide-y divide-blue-50">
                {itens.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 py-10 px-4">
                        <ShoppingCart className="w-10 h-10 opacity-30" />
                        <p className="text-sm text-center">Toque em um produto para adicioná-lo ao carrinho</p>
                    </div>
                ) : (
                    itens.map((item) => {
                        const isPesado = (item.unidade_medida ?? '').toLowerCase() === 'kg'
                        const subtotal = item.preco * item.quantidade
                        return (
                            <div key={item.cart_item_id} className="flex items-center gap-3 px-4 py-3">
                                {/* Nome + detalhe (unidade vs peso) */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">
                                        {isPesado && <Scale className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                                        {item.nome}
                                    </p>
                                    {isPesado ? (
                                        <p className="text-xs text-emerald-700/80 font-medium">
                                            {formatPeso(item.peso_gramas ?? Math.round(item.quantidade * 1000))} @ {formatBRL(item.preco)}/kg
                                        </p>
                                    ) : (
                                        <p className="text-xs text-gray-500">{formatBRL(item.preco)} × {item.quantidade}</p>
                                    )}
                                </div>

                                {/* Subtotal do item */}
                                <p className={`text-sm font-bold shrink-0 ${isPesado ? 'text-emerald-700' : 'text-primary'}`}>
                                    {formatBRL(subtotal)}
                                </p>

                                {/* Controles */}
                                <div className="flex items-center gap-1 shrink-0">
                                    {isPesado ? (
                                        // Itens pesados: re-pesar e remover (sem +/- de qty)
                                        <>
                                            <button
                                                onClick={() => onRemove(item.cart_item_id)}
                                                className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center
                                                           active:scale-90 transition-transform touch-manipulation border border-red-100"
                                                aria-label="Remover item"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </button>
                                            <button
                                                onClick={() => onRePesar(item.cart_item_id)}
                                                className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center
                                                           active:scale-90 transition-transform touch-manipulation border border-emerald-200"
                                                aria-label="Re-pesar item"
                                            >
                                                <Scale className="w-4 h-4 text-emerald-600" />
                                            </button>
                                        </>
                                    ) : (
                                        // Itens un: +/- e remover quando qty=1
                                        <>
                                            <button
                                                onClick={() => onRemove(item.cart_item_id)}
                                                className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center
                                                           active:scale-90 transition-transform touch-manipulation border border-red-100"
                                            >
                                                {item.quantidade === 1
                                                    ? <Trash2 className="w-4 h-4 text-red-500" />
                                                    : <Minus className="w-4 h-4 text-red-500" />
                                                }
                                            </button>
                                            <span className="w-7 text-center text-sm font-bold text-gray-700">
                                                {item.quantidade}
                                            </span>
                                            <button
                                                onClick={() => onAdd(item.cart_item_id)}
                                                className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center
                                                           active:scale-90 transition-transform touch-manipulation border border-blue-100"
                                            >
                                                <Plus className="w-4 h-4 text-primary" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Footer: Total + Destino + Botão Enviar */}
            <div className="px-4 py-4 border-t border-blue-100 space-y-3 bg-white">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-600">Total do Pedido</p>
                    <p className="text-xl font-extrabold text-primary">{formatBRL(total)}</p>
                </div>

                {/* Destino do pedido — segmented control */}
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Destino do pedido">
                    <button
                        type="button"
                        role="radio"
                        aria-checked={destinoCozinha}
                        onClick={() => onDestinoChange(true)}
                        className={`min-h-[48px] rounded-xl font-bold text-sm border-2 transition-all flex items-center justify-center gap-2 touch-manipulation active:scale-95 ${destinoCozinha
                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                            }`}
                    >
                        <ChefHat className="w-4 h-4" />
                        Cozinha
                    </button>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={!destinoCozinha}
                        onClick={() => onDestinoChange(false)}
                        className={`min-h-[48px] rounded-xl font-bold text-sm border-2 transition-all flex items-center justify-center gap-2 touch-manipulation active:scale-95 ${!destinoCozinha
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-200'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
                            }`}
                    >
                        <Wallet className="w-4 h-4" />
                        Direto p/ Caixa
                    </button>
                </div>

                <button
                    onClick={onSubmit}
                    disabled={isSubmitting || itens.length === 0}
                    className={`w-full h-14 rounded-2xl text-white font-bold text-base
                               flex items-center justify-center gap-3 active:scale-95 transition-all
                               disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation
                               shadow-lg ${destinoCozinha
                            ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30'
                            : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30'
                        }`}
                >
                    {destinoCozinha
                        ? <CookingPot className="w-5 h-5" />
                        : <DollarSign className="w-5 h-5" />}
                    {isSubmitting
                        ? 'Enviando...'
                        : destinoCozinha
                            ? 'Enviar pra Cozinha'
                            : 'Enviar Direto p/ Caixa'}
                </button>
            </div>
        </div>
    )
}
