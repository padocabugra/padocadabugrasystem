'use client'

import { useMemo, useState } from 'react'
import { X, Printer, Tag, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/formatters'
import { gerarBarcodeSVG, construirHtmlImpressao, type ItemEtiqueta } from '@/lib/etiqueta'
import type { Produto } from '@/lib/types/produto'

interface TamanhoPreset {
    label: string
    larguraMm: number
    alturaMm: number
    folhaA4: boolean
}

// Tamanhos universais — cobrem as etiquetadoras de rolo mais comuns + folha A4.
// Nada depende do modelo da impressora; quem ajusta o tamanho é a operadora.
const TAMANHOS: TamanhoPreset[] = [
    { label: 'Etiquetadora — Pequena (40×25mm)', larguraMm: 40, alturaMm: 25, folhaA4: false },
    { label: 'Etiquetadora — Média (50×30mm)', larguraMm: 50, alturaMm: 30, folhaA4: false },
    { label: 'Etiquetadora — Grande (60×40mm)', larguraMm: 60, alturaMm: 40, folhaA4: false },
    { label: 'Folha A4 (várias por página, 50×30mm)', larguraMm: 50, alturaMm: 30, folhaA4: true },
]

interface Props {
    produtos: Produto[]
    onClose: () => void
}

export default function ModalImprimirEtiquetas({ produtos, onClose }: Props) {
    const [tamanhoIdx, setTamanhoIdx] = useState(0)
    const [copias, setCopias] = useState(1)
    const [mostrarNome, setMostrarNome] = useState(true)
    const [mostrarPreco, setMostrarPreco] = useState(true)

    const comCodigo = useMemo(
        () => produtos.filter((p) => (p.codigo ?? '').trim() !== ''),
        [produtos],
    )
    const semCodigo = produtos.length - comCodigo.length

    // Preview: código de barras do 1º produto com código cadastrado.
    const previewSvg = useMemo(() => {
        const primeiro = comCodigo[0]
        return primeiro ? gerarBarcodeSVG(primeiro.codigo, { height: 46, fontSize: 14 }) : ''
    }, [comCodigo])

    function handleImprimir() {
        if (comCodigo.length === 0) {
            toast.error('Nenhum dos produtos selecionados tem código cadastrado.')
            return
        }
        const copiasSeguro = Math.max(1, Math.min(99, Math.floor(copias) || 1))
        const t = TAMANHOS[tamanhoIdx]
        const itens: ItemEtiqueta[] = comCodigo.map((p) => ({
            nome: p.nome,
            codigo: p.codigo,
            preco: Number(p.preco),
        }))
        const { html, ignorados } = construirHtmlImpressao(itens, {
            larguraMm: t.larguraMm,
            alturaMm: t.alturaMm,
            folhaA4: t.folhaA4,
            copias: copiasSeguro,
            mostrarNome,
            mostrarPreco,
        })

        const win = window.open('', '_blank', 'width=480,height=640')
        if (!win) {
            toast.error('Libere os pop-ups do navegador pra imprimir as etiquetas.')
            return
        }
        win.document.open()
        win.document.write(html)
        win.document.close()

        if (ignorados.length > 0) {
            toast.warning(`${ignorados.length} produto(s) sem código foram pulados.`)
        }
    }

    const primeiro = comCodigo[0]

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Tag className="w-5 h-5 text-primary" />
                        <h2 className="text-base font-bold text-gray-800">Imprimir etiquetas</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        {comCodigo.length} produto(s) com código serão impressos
                        {copias > 1 ? ` × ${Math.max(1, Math.floor(copias) || 1)} cópias` : ''}.
                    </p>

                    {semCodigo > 0 && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-800 text-xs">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>
                                {semCodigo} produto(s) sem código cadastrado serão ignorados. Cadastre o
                                código no produto pra incluí-lo.
                            </span>
                        </div>
                    )}

                    {/* Preview */}
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col items-center justify-center gap-1 min-h-[120px]">
                        {previewSvg ? (
                            <>
                                {mostrarNome && primeiro && (
                                    <span className="text-xs font-bold text-gray-800 truncate max-w-full">
                                        {primeiro.nome}
                                    </span>
                                )}
                                <span
                                    className="inline-block [&_svg]:max-w-full [&_svg]:h-auto"
                                    // SVG gerado pelo jsbarcode — conteúdo controlado, sem input do usuário.
                                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                                />
                                {mostrarPreco && primeiro && (
                                    <span className="text-sm font-extrabold text-gray-800">
                                        {formatCurrency(Number(primeiro.preco))}
                                    </span>
                                )}
                            </>
                        ) : (
                            <span className="text-xs text-gray-400">
                                Sem produto com código pra pré-visualizar.
                            </span>
                        )}
                    </div>

                    {/* Tamanho */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Tamanho da etiqueta</label>
                        <select
                            value={tamanhoIdx}
                            onChange={(e) => setTamanhoIdx(Number(e.target.value))}
                            className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                        >
                            {TAMANHOS.map((t, i) => (
                                <option key={t.label} value={i}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Cópias */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Cópias por produto</label>
                        <input
                            type="number"
                            min={1}
                            max={99}
                            value={copias}
                            onChange={(e) => setCopias(Number(e.target.value))}
                            className="w-28 h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                        />
                    </div>

                    {/* Toggles */}
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={mostrarNome} onChange={(e) => setMostrarNome(e.target.checked)} />
                            Mostrar nome
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={mostrarPreco} onChange={(e) => setMostrarPreco(e.target.checked)} />
                            Mostrar preço
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleImprimir}
                        disabled={comCodigo.length === 0}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <Printer className="w-4 h-4" />
                        Imprimir
                    </button>
                </div>
            </div>
        </div>
    )
}
