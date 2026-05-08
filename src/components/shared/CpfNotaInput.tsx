'use client'

import { useEffect } from 'react'
import { Receipt, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { formatCPF, unformatCPF, isValidCPF } from '@/lib/formatters'

interface CpfNotaInputProps {
    /** Valor formatado (com máscara) — controlado pelo pai */
    value: string
    onChange: (cpfFormatado: string) => void
    /**
     * CPF inicial (raw 11 dígitos OU formatado). Se mudar, atualiza o input
     * automaticamente via onChange. Útil quando o caixa troca de pedido.
     */
    cpfInicial?: string | null
}

export default function CpfNotaInput({ value, onChange, cpfInicial }: CpfNotaInputProps) {
    // Quando o cpfInicial mudar (ex.: trocou de pedido com cliente cadastrado),
    // dispara onChange com a versão formatada para o pai sincronizar o state.
    useEffect(() => {
        if (cpfInicial && unformatCPF(cpfInicial).length === 11) {
            onChange(formatCPF(cpfInicial))
        } else {
            onChange('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cpfInicial])

    const digits = unformatCPF(value)
    const completo = digits.length === 11
    const valido = completo && isValidCPF(value)
    const invalido = completo && !valido

    return (
        <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <Receipt className="w-4 h-4 text-gray-400" />
                CPF na nota? <span className="text-xs font-normal text-gray-400">(opcional)</span>
            </label>

            <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Somente se o cliente solicitar"
                        value={value}
                        onChange={(e) => onChange(formatCPF(e.target.value))}
                        className={`w-full h-12 px-4 pr-10 rounded-xl border-2 bg-white text-base font-mono tracking-wider
                                    focus:outline-none focus:ring-2 transition-colors ${invalido
                                        ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                                        : valido
                                            ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-100'
                                            : 'border-gray-200 focus:border-blue-400 focus:ring-blue-100'
                                    }`}
                    />
                    {valido && (
                        <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                    )}
                    {invalido && (
                        <AlertTriangle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => onChange('')}
                    disabled={!value}
                    className="h-12 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-600
                               hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40
                               disabled:cursor-not-allowed touch-manipulation flex items-center gap-1 shrink-0"
                >
                    <X className="w-3.5 h-3.5" />
                    Sem CPF
                </button>
            </div>

            {invalido ? (
                <p className="text-xs text-red-600 font-medium">CPF inválido — a nota será emitida sem o CPF.</p>
            ) : (
                <p className="text-xs text-gray-400">
                    CPF na nota é opcional. Informe apenas se o cliente solicitar.
                </p>
            )}
        </div>
    )
}
