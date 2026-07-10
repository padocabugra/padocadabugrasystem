'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Printer, Receipt, FileText, Ban, X } from 'lucide-react'
import { OPCOES_IMPRESSAO, opcaoImpressaoPadrao, type OpcaoImpressao } from '@/lib/impressao'

// Ícone por opção. A NFC-e é SEMPRE emitida à SEFAZ; estas opções escolhem só
// qual PAPEL sai na impressora.
const ICONES: Record<OpcaoImpressao, ReactNode> = {
    ambos: <Printer className="w-5 h-5" />,
    pedido: <Receipt className="w-5 h-5" />,
    nota: <FileText className="w-5 h-5" />,
    nenhum: <Ban className="w-5 h-5" />,
}

// Cor funcional por opção — cada uma tem identidade própria pra o operador
// reconhecer no relance (verde=completo, azul=pedido, índigo=fiscal, cinza=nada).
const ESTILO: Record<OpcaoImpressao, { card: string; badge: string; icone: string }> = {
    ambos: {
        card: 'border-emerald-200 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100',
        badge: 'bg-emerald-600',
        icone: 'text-emerald-600',
    },
    pedido: {
        card: 'border-sky-200 bg-sky-50 hover:border-sky-400 hover:bg-sky-100',
        badge: 'bg-sky-600',
        icone: 'text-sky-600',
    },
    nota: {
        card: 'border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100',
        badge: 'bg-indigo-600',
        icone: 'text-indigo-600',
    },
    nenhum: {
        card: 'border-slate-200 bg-slate-100 hover:border-slate-400 hover:bg-slate-200',
        badge: 'bg-slate-500',
        icone: 'text-slate-500',
    },
}

interface Props {
    aberto: boolean
    /** Bloqueia os botões enquanto a venda é processada (evita duplo disparo). */
    processando?: boolean
    onEscolher: (opcao: OpcaoImpressao) => void
    onCancelar: () => void
}

/**
 * Modal "O que imprimir?" — abre DEPOIS do pagamento confirmado. Cada opção é
 * uma AÇÃO direta (clique ou tecla 1–4): escolher já finaliza a venda com aquele
 * papel. A nota fiscal vai à SEFAZ de qualquer forma. Reutilizado no Caixa e na
 * Venda Rápida.
 */
export default function ModalImpressao({ aberto, processando, onEscolher, onCancelar }: Props) {
    // Atalhos de teclado 1–4 (escolhe a opção) e Esc (cancela). O listener só
    // existe enquanto o modal está aberto — sem colisão com outros atalhos.
    useEffect(() => {
        if (!aberto) return
        function onKey(e: KeyboardEvent) {
            if (processando) return
            if (e.key === 'Escape') { e.preventDefault(); onCancelar(); return }
            const idx = ['1', '2', '3', '4'].indexOf(e.key)
            if (idx >= 0 && idx < OPCOES_IMPRESSAO.length) {
                e.preventDefault()
                onEscolher(OPCOES_IMPRESSAO[idx].value)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [aberto, processando, onEscolher, onCancelar])

    if (!aberto) return null
    const padrao = opcaoImpressaoPadrao()

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={processando ? undefined : onCancelar}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in-0 zoom-in-95"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cabeçalho */}
                <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                            <Printer className="w-5 h-5 text-emerald-600" /> O que imprimir?
                        </h2>
                        <p className="text-xs text-gray-500 mt-1 leading-snug">
                            A nota fiscal vai pra SEFAZ do mesmo jeito — isto escolhe só o papel.
                        </p>
                    </div>
                    <button
                        onClick={onCancelar}
                        disabled={processando}
                        aria-label="Cancelar"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40 shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Opções — cada uma é uma ação direta */}
                <div className="p-4 space-y-2.5">
                    {OPCOES_IMPRESSAO.map((opt, i) => {
                        const s = ESTILO[opt.value]
                        return (
                            <button
                                key={opt.value}
                                onClick={() => onEscolher(opt.value)}
                                disabled={processando}
                                className={`w-full flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation ${s.card}`}
                            >
                                {/* Número do atalho */}
                                <span className={`flex items-center justify-center w-11 h-11 rounded-xl text-white font-black text-xl shrink-0 shadow-sm ${s.badge}`}>
                                    {i + 1}
                                </span>
                                <span className={`shrink-0 ${s.icone}`}>{ICONES[opt.value]}</span>
                                <span className="flex-1 min-w-0">
                                    <span className="flex items-center gap-2 font-bold text-gray-900 text-[15px]">
                                        {opt.titulo}
                                        {opt.value === padrao && (
                                            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200">
                                                padrão
                                            </span>
                                        )}
                                    </span>
                                    <span className="block text-xs text-gray-500 leading-tight mt-0.5">{opt.subtitulo}</span>
                                </span>
                                <kbd className="hidden sm:flex items-center justify-center w-6 h-6 rounded border border-gray-300 bg-white text-[11px] font-mono text-gray-400 shrink-0">
                                    {i + 1}
                                </kbd>
                            </button>
                        )
                    })}
                </div>

                {/* Dica de teclado */}
                <div className="px-6 pb-4 pt-0 text-center">
                    <p className="text-[11px] text-gray-400">
                        Toque numa opção ou use as teclas <b className="text-gray-500">1</b> a <b className="text-gray-500">4</b> · <b className="text-gray-500">Esc</b> cancela
                    </p>
                </div>
            </div>
        </div>
    )
}
