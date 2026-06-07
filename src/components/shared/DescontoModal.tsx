'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Percent, BadgePercent, Check, Eraser, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import {
    type TipoDesconto,
    calcularValorDesconto,
    percentualDoDesconto,
    round2,
} from '@/lib/desconto'

interface Props {
    /** Total bruto (sem desconto) sobre o qual o desconto incide. */
    totalBruto: number
    /** Desconto já aplicado (R$), 0 se nenhum. */
    descontoAtual: number
    /** Confirma o desconto em reais (já saneado: 0..totalBruto, 2 casas). */
    onAplicar: (descontoReais: number) => void
    onClose: () => void
}

// Atalhos de porcentagem — agilizam o caso comum ("dá 10% pra ela").
const ATALHOS_PCT = [5, 10, 15, 20]

export default function DescontoModal({ totalBruto, descontoAtual, onAplicar, onClose }: Props) {
    const [tipo, setTipo] = useState<TipoDesconto>('valor')
    // Texto livre do input (aceita vírgula). Inicia com o desconto atual em R$.
    const [entrada, setEntrada] = useState(descontoAtual > 0 ? String(descontoAtual).replace('.', ',') : '')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        // foca e seleciona ao abrir — operador já digita direto
        const t = setTimeout(() => inputRef.current?.select(), 50)
        return () => clearTimeout(t)
    }, [])

    const entradaNum = parseFloat(entrada.replace(',', '.')) || 0
    const desconto = useMemo(
        () => calcularValorDesconto(tipo, entradaNum, totalBruto),
        [tipo, entradaNum, totalBruto]
    )
    const liquido = round2(Math.max(0, totalBruto - desconto))
    const pct = percentualDoDesconto(desconto, totalBruto)

    // Bloqueia desconto que zera (ou passa) o total — NFC-e exige total > 0.
    const zeraTotal = desconto > 0 && liquido <= 0
    const podeAplicar = desconto > 0 && !zeraTotal

    function aplicar() {
        if (!podeAplicar) return
        onAplicar(desconto)
        onClose()
    }

    function remover() {
        onAplicar(0)
        onClose()
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in-0 zoom-in-95">
                {/* Header */}
                <div className="px-5 py-4 bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-between">
                    <h3 className="font-bold text-base flex items-center gap-2">
                        <BadgePercent className="w-5 h-5" />
                        Aplicar desconto
                    </h3>
                    <button onClick={onClose} className="p-1 text-white/80 hover:text-white rounded">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Toggle R$ / % */}
                    <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                        <button
                            onClick={() => setTipo('valor')}
                            className={`py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${tipo === 'valor' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            R$ Valor
                        </button>
                        <button
                            onClick={() => setTipo('percentual')}
                            className={`py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${tipo === 'percentual' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Percent className="w-4 h-4" /> Percentual
                        </button>
                    </div>

                    {/* Input */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            {tipo === 'valor' ? 'Valor do desconto' : 'Percentual do desconto'}
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg font-medium">
                                {tipo === 'valor' ? 'R$' : ''}
                            </span>
                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="decimal"
                                value={entrada}
                                onChange={(e) => setEntrada(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') aplicar() }}
                                placeholder={tipo === 'valor' ? '0,00' : '0'}
                                className={`w-full ${tipo === 'valor' ? 'pl-12' : 'pl-4'} pr-10 py-3 border-2 border-gray-200 focus:border-amber-400 rounded-xl text-2xl font-bold text-gray-800 outline-none transition-colors text-center`}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg font-medium">
                                {tipo === 'percentual' ? '%' : ''}
                            </span>
                        </div>

                        {/* Atalhos de % */}
                        {tipo === 'percentual' && (
                            <div className="grid grid-cols-4 gap-2 mt-2">
                                {ATALHOS_PCT.map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setEntrada(String(p))}
                                        className="py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-sm font-bold transition-colors"
                                    >
                                        {p}%
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Preview ao vivo */}
                    <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Subtotal</span>
                            <span className="font-semibold text-gray-700">{formatCurrency(totalBruto)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-amber-700 font-medium">Desconto{desconto > 0 ? ` (${pct}%)` : ''}</span>
                            <span className="font-bold text-amber-700">- {formatCurrency(desconto)}</span>
                        </div>
                        <div className="border-t border-dashed border-gray-200 my-1" />
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-600 flex items-center gap-1">
                                Total <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                            </span>
                            <span className="text-xl font-black text-emerald-600">{formatCurrency(liquido)}</span>
                        </div>
                    </div>

                    {zeraTotal && (
                        <p className="text-xs text-red-600 font-medium text-center">
                            O desconto não pode zerar o total. Para isenção total, cancele o pedido.
                        </p>
                    )}

                    {/* Ações */}
                    <div className="flex gap-2 pt-1">
                        {descontoAtual > 0 && (
                            <button
                                onClick={remover}
                                className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm flex items-center justify-center gap-1.5 transition-colors"
                            >
                                <Eraser className="w-4 h-4" /> Remover
                            </button>
                        )}
                        <button
                            onClick={aplicar}
                            disabled={!podeAplicar}
                            className="flex-[2] py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-extrabold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:cursor-not-allowed"
                        >
                            <Check className="w-4 h-4" /> Aplicar desconto
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
