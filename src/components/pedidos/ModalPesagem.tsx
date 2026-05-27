'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Scale, X, Check, Search, ArrowLeft, Package } from 'lucide-react'
import type { Produto } from '@/lib/types'

// Camada de pesagem
// -----------------
// Hoje o peso vem do input manual digitado pelo garcom. No futuro, quando a
// balanca profissional for integrada, basta adicionar uma fonte alternativa
// dentro deste modal (ex: hook useBalanca() que escuta WebSerial/HID e chama
// setPesoGramas automaticamente quando estabilizar). A interface externa
// (onConfirmar(produto, pesoGramas)) nao muda — o resto do app continua agnostico
// a origem do peso.
//
// Dois modos:
//   1) Direto: passa `produto` ja escolhido (clique no card kg do catalogo)
//   2) Selecao: passa `produtosKg` (lista filtrada) — modal abre uma tela
//      de busca/selecao antes de ir pra tela de peso. Usado pelo botao
//      "Pesagem" manual no PDV e no Novo Pedido.

interface ModalPesagemProps {
    produto?: Produto                  // modo direto
    produtosKg?: Produto[]             // modo selecao
    onConfirmar: (produto: Produto, pesoGramas: number) => void
    onCancelar: () => void
    pesoInicialGramas?: number         // pra re-pesagem (so modo direto)
}

const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export default function ModalPesagem({
    produto,
    produtosKg,
    onConfirmar,
    onCancelar,
    pesoInicialGramas,
}: ModalPesagemProps) {
    // Em modo selecao, comeca em 'selecao'; em modo direto, ja vai pra 'peso'.
    const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(produto ?? null)
    const [pesoStr, setPesoStr] = useState<string>(
        pesoInicialGramas ? String(pesoInicialGramas) : ''
    )
    const [busca, setBusca] = useState('')

    const inputRef = useRef<HTMLInputElement>(null)
    const buscaRef = useRef<HTMLInputElement>(null)

    const etapa: 'selecao' | 'peso' = produtoSelecionado ? 'peso' : 'selecao'

    // Foco automatico no input certo conforme a etapa
    useEffect(() => {
        const t = setTimeout(() => {
            if (etapa === 'peso') inputRef.current?.focus()
            else buscaRef.current?.focus()
        }, 60)
        return () => clearTimeout(t)
    }, [etapa])

    // ESC fecha modal (ou volta pra selecao se estiver na etapa de peso e tiver lista)
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key !== 'Escape') return
            if (etapa === 'peso' && produtosKg && !produto) {
                // Tem lista pra voltar — em vez de fechar, volta pra selecao
                setProdutoSelecionado(null)
                setPesoStr('')
                return
            }
            onCancelar()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [etapa, onCancelar, produto, produtosKg])

    // ── Modo selecao: filtragem ──
    const listaFiltrada = useMemo(() => {
        if (!produtosKg) return [] as Produto[]
        const termo = busca.trim().toLowerCase()
        const apenasKg = produtosKg.filter(
            (p) => (p.unidade_medida ?? '').toLowerCase() === 'kg'
        )
        if (!termo) return apenasKg
        return apenasKg.filter((p) =>
            p.nome.toLowerCase().includes(termo)
            || (p.codigo ?? '').toLowerCase().includes(termo)
        )
    }, [produtosKg, busca])

    // ── Modo peso: calculos ──
    const precoPorKg = Number(produtoSelecionado?.preco) || 0
    const pesoGramas = Math.max(0, Math.floor(Number(pesoStr) || 0))
    const pesoKg = pesoGramas / 1000
    const subtotal = pesoKg * precoPorKg
    const podeConfirmar = !!produtoSelecionado && pesoGramas > 0

    function handleConfirmar() {
        if (!podeConfirmar || !produtoSelecionado) return
        onConfirmar(produtoSelecionado, pesoGramas)
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleConfirmar()
        }
    }

    function handleSelecionarProduto(p: Produto) {
        setProdutoSelecionado(p)
        setPesoStr('')
    }

    function handleVoltarSelecao() {
        setProdutoSelecionado(null)
        setPesoStr('')
    }

    const podeVoltar = etapa === 'peso' && !!produtosKg && !produto

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onCancelar}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 pt-5 pb-4 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white relative shrink-0">
                    <button
                        onClick={onCancelar}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    {podeVoltar && (
                        <button
                            onClick={handleVoltarSelecao}
                            className="absolute top-3 left-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                            aria-label="Voltar"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className={`flex items-center gap-3 mb-1 ${podeVoltar ? 'pl-9' : ''}`}>
                        <Scale className="w-6 h-6 opacity-90" />
                        <h2 className="text-lg font-bold">
                            {etapa === 'selecao' ? 'Pesagem — Escolher Produto' : 'Registrar Pesagem'}
                        </h2>
                    </div>
                    <p className={`text-emerald-100/90 text-sm leading-tight ${podeVoltar ? 'pl-9' : ''}`}>
                        {etapa === 'selecao'
                            ? 'Selecione um produto vendido por kg.'
                            : 'Anote o peso lido na balança para calcular o valor.'}
                    </p>
                </div>

                {/* ── ETAPA: Seleção ── */}
                {etapa === 'selecao' && (
                    <div className="flex flex-col flex-1 min-h-0">
                        {/* Busca */}
                        <div className="px-6 pt-4 pb-3 shrink-0">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    ref={buscaRef}
                                    type="search"
                                    placeholder="Buscar produto por kg..."
                                    value={busca}
                                    onChange={(e) => setBusca(e.target.value)}
                                    className="w-full h-11 pl-10 pr-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/40 text-sm
                                               focus:outline-none focus:border-emerald-400 focus:bg-white"
                                />
                            </div>
                        </div>

                        {/* Lista */}
                        <div className="flex-1 overflow-y-auto px-3 pb-4">
                            {listaFiltrada.length === 0 ? (
                                <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-gray-400 gap-2 py-6 text-center">
                                    <Package className="w-10 h-10 opacity-30" />
                                    <p className="text-sm px-6">
                                        {busca
                                            ? 'Nenhum produto encontrado.'
                                            : 'Nenhum produto cadastrado com unidade kg. Edite o produto em "Produtos" e defina a unidade como kg.'}
                                    </p>
                                </div>
                            ) : (
                                <ul className="space-y-1.5 px-3">
                                    {listaFiltrada.map((p) => (
                                        <li key={p.id}>
                                            <button
                                                onClick={() => handleSelecionarProduto(p)}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                                                           border border-emerald-100 bg-white hover:bg-emerald-50
                                                           hover:border-emerald-300 active:scale-[0.98] transition-all
                                                           text-left touch-manipulation"
                                            >
                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center text-lg shrink-0">
                                                    ⚖️
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{p.nome}</p>
                                                    <p className="text-xs text-emerald-700 font-bold">
                                                        {formatBRL(Number(p.preco))}
                                                        <span className="font-medium opacity-70"> /kg</span>
                                                    </p>
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}

                {/* ── ETAPA: Peso ── */}
                {etapa === 'peso' && produtoSelecionado && (
                    <>
                        <div className="px-6 py-5 space-y-5 overflow-y-auto">
                            {/* Produto */}
                            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                                <p className="text-xs font-semibold text-emerald-700/80 uppercase tracking-wider mb-1">
                                    Produto
                                </p>
                                <p className="text-base font-bold text-gray-800">{produtoSelecionado.nome}</p>
                                <p className="text-sm text-emerald-700 font-bold mt-1">
                                    {formatBRL(precoPorKg)} <span className="text-xs font-medium opacity-70">/ kg</span>
                                </p>
                            </div>

                            {/* Input de peso em gramas */}
                            <div>
                                <label htmlFor="peso-gramas" className="block text-sm font-semibold text-gray-700 mb-2">
                                    Peso lido na balança
                                </label>
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        id="peso-gramas"
                                        type="number"
                                        inputMode="numeric"
                                        min={1}
                                        step={1}
                                        placeholder="0"
                                        value={pesoStr}
                                        onChange={(e) => setPesoStr(e.target.value.replace(/[^\d]/g, ''))}
                                        onKeyDown={handleKeyDown}
                                        className="w-full h-16 px-5 pr-16 rounded-xl border-2 border-emerald-200 bg-white
                                                   text-right text-3xl font-extrabold text-gray-800
                                                   focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100
                                                   placeholder:text-gray-300"
                                    />
                                    <span className="absolute right-5 top-1/2 -translate-y-1/2 text-base font-bold text-gray-400 pointer-events-none">
                                        g
                                    </span>
                                </div>
                                {pesoGramas >= 1000 && (
                                    <p className="text-xs text-gray-500 mt-1.5 text-right">
                                        = {(pesoGramas / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg
                                    </p>
                                )}
                            </div>

                            {/* Subtotal em tempo real */}
                            <div className={`rounded-xl border-2 px-4 py-3 transition-colors ${podeConfirmar
                                ? 'bg-emerald-50 border-emerald-300'
                                : 'bg-gray-50 border-gray-200'
                                }`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold text-gray-600">Valor a cobrar</p>
                                    <p className={`text-2xl font-extrabold ${podeConfirmar ? 'text-emerald-700' : 'text-gray-400'}`}>
                                        {formatBRL(subtotal)}
                                    </p>
                                </div>
                                {podeConfirmar && (
                                    <p className="text-xs text-gray-500 mt-1 text-right">
                                        {(pesoKg).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg × {formatBRL(precoPorKg)}/kg
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Acoes */}
                        <div className="px-6 pb-6 pt-1 grid grid-cols-2 gap-3 shrink-0">
                            <button
                                onClick={onCancelar}
                                className="h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm
                                           active:scale-95 transition-all touch-manipulation"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmar}
                                disabled={!podeConfirmar}
                                className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm
                                           flex items-center justify-center gap-2
                                           active:scale-95 transition-all touch-manipulation
                                           disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600
                                           shadow-lg shadow-emerald-500/20"
                            >
                                <Check className="w-4 h-4" />
                                {pesoInicialGramas ? 'Atualizar' : 'Adicionar'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
