'use client'

import type { ReactNode } from 'react'
import { Printer, Receipt, FileText, Ban } from 'lucide-react'
import { OPCOES_IMPRESSAO, type OpcaoImpressao } from '@/lib/impressao'

// Ícone por opção. A NFC-e é SEMPRE emitida à SEFAZ; estes botões escolhem só
// qual PAPEL sai na impressora.
const ICONES: Record<OpcaoImpressao, ReactNode> = {
    ambos: <Printer className="w-4 h-4 shrink-0" />,
    pedido: <Receipt className="w-4 h-4 shrink-0" />,
    nota: <FileText className="w-4 h-4 shrink-0" />,
    nenhum: <Ban className="w-4 h-4 shrink-0" />,
}

interface Props {
    value: OpcaoImpressao
    onChange: (opcao: OpcaoImpressao) => void
    disabled?: boolean
    className?: string
}

/**
 * Seletor "O que imprimir?" — grid 2x2 de chips (Nota + Pedido / Só Pedido /
 * Só Nota / Não imprimir). Controla apenas o papel na térmica; a nota fiscal é
 * emitida à SEFAZ de qualquer forma. Reutilizado no Caixa e na Venda Rápida.
 */
export default function SeletorImpressao({ value, onChange, disabled, className }: Props) {
    return (
        <div className={className}>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5" /> O que imprimir?
            </p>
            <div className="grid grid-cols-2 gap-2">
                {OPCOES_IMPRESSAO.map((opt) => {
                    const ativo = value === opt.value
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange(opt.value)}
                            disabled={disabled}
                            aria-pressed={ativo}
                            className={`flex flex-col items-start gap-0.5 rounded-xl border-2 px-3 py-2 text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                                ativo
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-200'
                                    : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300 hover:bg-emerald-50'
                            }`}
                        >
                            <span className="flex items-center gap-1.5 font-bold text-sm">
                                {ICONES[opt.value]} {opt.titulo}
                            </span>
                            <span className={`text-[10px] leading-tight ${ativo ? 'text-emerald-50' : 'text-gray-400'}`}>
                                {opt.subtitulo}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
