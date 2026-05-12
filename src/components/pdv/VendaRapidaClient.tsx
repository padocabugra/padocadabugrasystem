'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
    Search, Plus, Minus, Trash2, ShoppingCart, Package,
    Banknote, Smartphone, CreditCard, X, Zap, Lock, CheckCircle2,
    Receipt, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, unformatCPF, isValidCPF } from '@/lib/formatters'
import type { Produto } from '@/lib/types'
import CpfNotaInput from '@/components/shared/CpfNotaInput'
import { QRCodeSVG } from 'qrcode.react'

type FormaPagamento = 'dinheiro' | 'pix' | 'debito' | 'credito'

interface CartItem {
    id: string
    nome: string
    preco: number
    quantidade: number
    // Dados fiscais vindos do produto
    ncm?: string | null
    cfop?: string | null
    csosn?: string | null
}

interface NfceInfo {
    ok: boolean
    chaveAcesso?: string
    danfeUrl?: string
    erro?: string
}

interface ReciboFinal {
    pedidoId: string
    total: number
    troco: number
    formaPagamento: FormaPagamento
    itensSnapshot: CartItem[]
    nfce: NfceInfo
    /** CPF formatado (snapshot pra reemitir). Vazio se não informado. */
    cpfCliente?: string
}

interface Props {
    vendedorId: string
    vendedorNome: string
    caixaAberto: boolean
    produtos: Produto[]
}

const FORMAS: { value: FormaPagamento; label: string; icon: React.ReactNode }[] = [
    { value: 'dinheiro', label: 'Dinheiro', icon: <Banknote className="w-5 h-5" /> },
    { value: 'pix', label: 'PIX', icon: <Smartphone className="w-5 h-5" /> },
    { value: 'debito', label: 'Débito', icon: <CreditCard className="w-5 h-5" /> },
    { value: 'credito', label: 'Crédito', icon: <CreditCard className="w-5 h-5" /> },
]

export default function VendaRapidaClient({ vendedorId, caixaAberto, produtos }: Props) {
    const supabase = createClient()

    const [carrinho, setCarrinho] = useState<CartItem[]>([])
    const [busca, setBusca] = useState('')
    const [categoriaAtiva, setCategoriaAtiva] = useState<string>('Todos')

    const [modalPagamento, setModalPagamento] = useState(false)
    const [modalPix, setModalPix] = useState(false)
    const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('dinheiro')
    const [valorRecebido, setValorRecebido] = useState('')
    const [processando, setProcessando] = useState(false)

    const [recibo, setRecibo] = useState<ReciboFinal | null>(null)

    // CPF na nota (opcional). Formatado: 000.000.000-00
    const [cpfNota, setCpfNota] = useState('')

    // ── Filtros ───────────────────────────────────────────────────────
    const produtosFiltrados = useMemo(() => {
        const termo = busca.trim().toLowerCase()
        return produtos.filter((p) => {
            const matchBusca = !termo
                || p.nome.toLowerCase().includes(termo)
                || (p.codigo ?? '').toLowerCase().includes(termo)
            const matchCat = categoriaAtiva === 'Todos' || p.categoria === categoriaAtiva
            return matchBusca && matchCat
        })
    }, [produtos, busca, categoriaAtiva])

    const categorias = useMemo(() => {
        const cats = new Set(produtos.map((p) => p.categoria).filter(Boolean))
        return ['Todos', ...Array.from(cats).sort()]
    }, [produtos])

    // ── Carrinho ──────────────────────────────────────────────────────
    function adicionar(produto: Produto) {
        setCarrinho((prev) => {
            const existente = prev.find((i) => i.id === produto.id)
            if (existente) {
                return prev.map((i) =>
                    i.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
                )
            }
            return [...prev, {
                id: produto.id,
                nome: produto.nome,
                preco: Number(produto.preco),
                quantidade: 1,
                ncm: produto.ncm ?? null,
                cfop: produto.cfop ?? null,
                csosn: produto.csosn ?? null,
            }]
        })
    }

    function alterarQtd(id: string, delta: number) {
        setCarrinho((prev) => prev
            .map((i) => i.id === id ? { ...i, quantidade: i.quantidade + delta } : i)
            .filter((i) => i.quantidade > 0)
        )
    }

    function removerItem(id: string) {
        setCarrinho((prev) => prev.filter((i) => i.id !== id))
    }

    const total = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
    const valorRecebidoNum = parseFloat(valorRecebido.replace(',', '.')) || 0
    const troco = formaPagamento === 'dinheiro' ? Math.max(0, valorRecebidoNum - total) : 0
    const valorInsuficiente = formaPagamento === 'dinheiro' && valorRecebidoNum < total

    // ── Atalho ESC fecha modal ────────────────────────────────────────
    useEffect(() => {
        if (!modalPagamento) return
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setModalPagamento(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [modalPagamento])

    // ── Caixa fechado: tela bloqueadora (após hooks p/ respeitar Rules of Hooks) ──
    if (!caixaAberto) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6 text-center">
                <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
                    <Lock className="w-10 h-10 text-amber-600" />
                </div>
                <div className="space-y-2 max-w-md">
                    <h1 className="text-xl font-bold text-gray-800">Caixa fechado</h1>
                    <p className="text-sm text-gray-600">
                        Abra o caixa antes de realizar vendas rápidas. Isso garante que
                        as movimentações fiquem registradas no saldo do dia.
                    </p>
                </div>
                <Link
                    href="/dashboard/caixa"
                    className="px-6 h-12 inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-all"
                >
                    Abrir Caixa
                </Link>
            </div>
        )
    }

    // ── NFC-e (após pagamento confirmado, NÃO cancela a venda em caso de erro) ──
    async function emitirNFCe(
        pedidoId: string,
        valorTotal: number,
        forma: FormaPagamento,
        itens: CartItem[],
        cpf?: string,
    ): Promise<NfceInfo> {
        try {
            const cpfDigits = cpf ? unformatCPF(cpf) : ''
            const cpfClienteEnvio = cpfDigits.length === 11 && isValidCPF(cpfDigits) ? cpfDigits : undefined

            const res = await fetch('/api/nfce/emitir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pedidoId,
                    total: valorTotal,
                    formaPagamento: forma,
                    cpfCliente: cpfClienteEnvio,
                    itens: itens.map((i) => ({
                        nome: i.nome,
                        ncm: i.ncm || undefined,
                        cfop: i.cfop ? Number(i.cfop) : undefined,
                        csosn: i.csosn || undefined,
                        quantidade: i.quantidade,
                        valorUnitario: i.preco,
                        unidade: 'UN',
                    })),
                }),
            })
            const json = await res.json()
            if (json.ok) {
                toast.success('NFC-e emitida!', {
                    description: `Chave: ${String(json.chaveAcesso ?? '').slice(0, 16)}…`,
                })
            } else {
                toast.warning('Venda registrada, mas NFC-e falhou', {
                    description: json.erro,
                })
            }
            return json
        } catch (err: any) {
            const msg = err?.message ?? 'erro de rede'
            toast.warning('Venda registrada, mas NFC-e falhou', { description: msg })
            return { ok: false, erro: msg }
        }
    }

    async function handleReemitirNFCe() {
        if (!recibo) return
        const nfce = await emitirNFCe(
            recibo.pedidoId,
            recibo.total,
            recibo.formaPagamento,
            recibo.itensSnapshot,
            recibo.cpfCliente,
        )
        setRecibo({ ...recibo, nfce })
    }

    // ── Finalizar ─────────────────────────────────────────────────────
    async function handleFinalizar() {
        if (carrinho.length === 0) return
        if (valorInsuficiente) {
            toast.error('Valor recebido menor que o total')
            return
        }

        setProcessando(true)

        const valorPago = formaPagamento === 'dinheiro' ? valorRecebidoNum : total

        const { data, error } = await supabase.rpc('create_venda_rapida', {
            p_vendedor_id: vendedorId,
            p_total: total,
            p_forma_pagamento: formaPagamento,
            p_valor_pago: valorPago,
            p_cliente_id: null,
            p_itens: carrinho.map((i) => ({
                produto_id: i.id,
                quantidade: i.quantidade,
                preco_unitario: i.preco,
            })),
        })

        if (error) {
            setProcessando(false)
            const msg = error.message ?? ''
            if (msg.includes('CAIXA_FECHADO')) {
                toast.error('Abra o caixa antes de realizar vendas rápidas.')
            } else {
                toast.error('Erro ao finalizar venda', { description: msg })
            }
            return
        }

        const pedidoId = (data as any)?.pedido_id as string
        const trocoFinal = (data as any)?.troco ?? 0
        const totalSnapshot = total
        const formaSnapshot = formaPagamento
        const itensSnapshot = carrinho

        const cpfSnapshot = cpfNota

        toast.success(`Venda finalizada! Total: ${formatCurrency(totalSnapshot)}`)

        // Emite NFC-e (não cancela a venda se falhar)
        const nfce = await emitirNFCe(pedidoId, totalSnapshot, formaSnapshot, itensSnapshot, cpfSnapshot)

        setRecibo({
            pedidoId,
            total: totalSnapshot,
            troco: trocoFinal,
            formaPagamento: formaSnapshot,
            itensSnapshot,
            nfce,
            cpfCliente: cpfSnapshot,
        })

        setCarrinho([])
        setModalPagamento(false)
        setModalPix(false)
        setValorRecebido('')
        setFormaPagamento('dinheiro')
        setCpfNota('')
        setProcessando(false)
    }

    // ─────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-3 h-[calc(100vh-7rem)]">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-emerald-500 fill-emerald-500" />
                        Venda Rápida
                    </h1>
                    <p className="text-sm text-gray-500">Balcão — sem cadastro, finaliza direto no caixa.</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 flex-1 min-h-0">
                {/* ── Catálogo ── */}
                <div className="flex-1 flex flex-col bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden min-h-0">
                    {/* Busca + Categorias */}
                    <div className="p-3 border-b border-blue-50 space-y-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar produto (nome, código)..."
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                className="w-full pl-9 pr-4 h-11 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                                autoFocus
                            />
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                            {categorias.map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setCategoriaAtiva(cat)}
                                    className={`px-3 h-8 rounded-full text-xs font-bold whitespace-nowrap transition-colors shrink-0 ${categoriaAtiva === cat
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Grid */}
                    <div className="flex-1 overflow-y-auto p-3">
                        {produtosFiltrados.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <Package className="w-10 h-10 mb-2 opacity-20" />
                                <p className="text-sm">Nenhum produto encontrado</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                {produtosFiltrados.map((produto) => (
                                    <button
                                        key={produto.id}
                                        onClick={() => adicionar(produto)}
                                        className="text-left bg-white border-2 border-gray-100 rounded-xl p-3 hover:border-blue-300 hover:shadow-md active:scale-95 transition-all min-h-[88px] flex flex-col justify-between touch-manipulation"
                                    >
                                        <div>
                                            <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">{produto.categoria}</span>
                                            <h3 className="font-semibold text-gray-800 text-sm leading-snug line-clamp-2">{produto.nome}</h3>
                                        </div>
                                        <span className="font-extrabold text-primary text-base mt-1">{formatCurrency(Number(produto.preco))}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Carrinho ── */}
                <div className="w-full md:w-96 bg-white rounded-2xl border border-blue-100 shadow-sm flex flex-col overflow-hidden">
                    <div className="p-3 border-b border-blue-50 bg-blue-50/30 flex items-center justify-between">
                        <h2 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
                            <ShoppingCart className="w-4 h-4 text-primary" />
                            Carrinho
                            {carrinho.length > 0 && (
                                <span className="bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                    {carrinho.reduce((acc, i) => acc + i.quantidade, 0)}
                                </span>
                            )}
                        </h2>
                        {carrinho.length > 0 && (
                            <button
                                onClick={() => setCarrinho([])}
                                className="text-xs text-red-500 font-semibold hover:underline"
                            >
                                Limpar
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-blue-50">
                        {carrinho.length === 0 ? (
                            <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                                <ShoppingCart className="w-8 h-8 mb-2 opacity-20" />
                                <p className="text-sm">Toque em um produto para adicioná-lo</p>
                            </div>
                        ) : (
                            carrinho.map((item) => (
                                <div key={item.id} className="flex items-center gap-2 px-3 py-2.5">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{item.nome}</p>
                                        <p className="text-xs text-gray-500">{formatCurrency(item.preco)} × {item.quantidade}</p>
                                    </div>
                                    <p className="text-sm font-bold text-primary shrink-0">
                                        {formatCurrency(item.preco * item.quantidade)}
                                    </p>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => alterarQtd(item.id, -1)}
                                            className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
                                        >
                                            {item.quantidade === 1
                                                ? <Trash2 className="w-4 h-4 text-red-500" />
                                                : <Minus className="w-4 h-4 text-red-500" />
                                            }
                                        </button>
                                        <span className="w-7 text-center text-sm font-bold text-gray-700">{item.quantidade}</span>
                                        <button
                                            onClick={() => alterarQtd(item.id, +1)}
                                            className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
                                        >
                                            <Plus className="w-4 h-4 text-primary" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-3 border-t border-blue-50 space-y-2 bg-white">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-600">Total</p>
                            <p className="text-2xl font-extrabold text-primary">{formatCurrency(total)}</p>
                        </div>
                        <button
                            onClick={() => setModalPagamento(true)}
                            disabled={carrinho.length === 0}
                            className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation shadow-lg shadow-emerald-500/30"
                        >
                            <Zap className="w-5 h-5 fill-white" />
                            Finalizar Venda
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Modal Pagamento ── */}
            {modalPagamento && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
                        <div className="px-5 py-4 border-b flex items-center justify-between bg-emerald-50/60">
                            <h3 className="font-bold text-lg text-gray-800">Pagamento</h3>
                            <button onClick={() => setModalPagamento(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                            {/* CPF na nota (opcional) — antes da forma de pagamento */}
                            <CpfNotaInput value={cpfNota} onChange={setCpfNota} />

                            <div>
                                <p className="text-sm font-semibold text-gray-700 mb-2">Forma de Pagamento</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {FORMAS.map((f) => (
                                        <button
                                            key={f.value}
                                            onClick={() => setFormaPagamento(f.value)}
                                            className={`min-h-[52px] rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 transition-all touch-manipulation active:scale-95 ${formaPagamento === f.value
                                                ? 'bg-primary text-white border-primary shadow-lg shadow-blue-200'
                                                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                                }`}
                                        >
                                            {f.icon}
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {formaPagamento === 'dinheiro' && (
                                <div className="space-y-2">
                                    <label className="block text-sm font-semibold text-gray-700">Valor Recebido</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={valorRecebido}
                                        onChange={(e) => setValorRecebido(e.target.value)}
                                        placeholder="0,00"
                                        autoFocus
                                        className="w-full h-14 px-4 rounded-xl border-2 border-gray-200 bg-white text-center text-2xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 placeholder:text-gray-300"
                                    />
                                    {valorRecebido && (
                                        <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${valorInsuficiente
                                            ? 'bg-red-50 border border-red-200'
                                            : 'bg-emerald-50 border border-emerald-200'
                                            }`}>
                                            <span className={`text-sm font-medium ${valorInsuficiente ? 'text-red-700' : 'text-emerald-700'}`}>
                                                {valorInsuficiente ? 'Valor insuficiente' : 'Troco'}
                                            </span>
                                            <span className={`text-xl font-extrabold ${valorInsuficiente ? 'text-red-700' : 'text-emerald-700'}`}>
                                                {formatCurrency(valorInsuficiente ? total - valorRecebidoNum : troco)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-sm text-gray-500">Total a Pagar</span>
                                <span className="text-2xl font-extrabold text-primary">{formatCurrency(total)}</span>
                            </div>
                        </div>

                        <div className="px-5 py-4 bg-gray-50">
                            <button
                                onClick={() => formaPagamento === 'pix' ? setModalPix(true) : handleFinalizar()}
                                disabled={processando || valorInsuficiente || carrinho.length === 0}
                                className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation shadow-lg shadow-emerald-500/30"
                            >
                                {processando ? 'Processando...' : formaPagamento === 'pix' ? (
                                    <>
                                        <Smartphone className="w-5 h-5" />
                                        Gerar QR Code PIX
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-5 h-5" />
                                        Confirmar Venda
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal PIX ── */}
            {modalPix && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in-0 zoom-in-95 text-center">
                        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                            <h2 className="text-lg font-bold flex items-center justify-center gap-2">
                                <Smartphone className="w-5 h-5" /> Pagamento via PIX
                            </h2>
                            <p className="text-emerald-100 text-sm mt-1">Aguardando pagamento do cliente</p>
                        </div>
                        <div className="p-6 flex flex-col items-center">
                            <div className="bg-white p-3 rounded-xl border-2 border-emerald-100 shadow-sm mb-4 inline-block">
                                <QRCodeSVG
                                    value={`00020126580014br.gov.bcb.pix0136${vendedorId}520400005303986540${total.toFixed(2).length < 10 ? '0' : ''}${total.toFixed(2).length}${total.toFixed(2)}5802BR5915Padoca CRM6008BRASILIA62070503***6304`}
                                    size={180}
                                    level="M"
                                    includeMargin={false}
                                />
                            </div>
                            <p className="text-sm text-gray-500 mb-1">Total a Pagar</p>
                            <p className="text-3xl font-black text-gray-900 mb-6">{formatCurrency(total)}</p>
                            
                            <div className="flex w-full gap-3">
                                <button
                                    onClick={() => setModalPix(false)}
                                    disabled={processando}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleFinalizar}
                                    disabled={processando}
                                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    {processando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal final: troco + NFC-e ── */}
            {recibo && (recibo.troco > 0 || recibo.nfce) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white text-center">
                            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-90" />
                            <h2 className="text-lg font-bold">Venda Finalizada!</h2>
                        </div>
                        <div className="px-6 py-5 space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">Total da venda</span>
                                <span className="font-bold text-gray-800">{formatCurrency(recibo.total)}</span>
                            </div>
                            {recibo.troco > 0 && (
                                <div className="rounded-xl bg-amber-50 border-2 border-amber-200 px-4 py-4 text-center">
                                    <p className="text-xs uppercase font-bold text-amber-700 tracking-wider">Troco</p>
                                    <p className="text-3xl font-extrabold text-amber-700 mt-1">{formatCurrency(recibo.troco)}</p>
                                </div>
                            )}
                            {recibo.nfce && (
                                recibo.nfce.ok ? (
                                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 space-y-1.5">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                                                <Receipt className="w-4 h-4" /> NFC-e emitida
                                            </span>
                                            {recibo.nfce.danfeUrl && (
                                                <a
                                                    href={recibo.nfce.danfeUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs font-bold text-emerald-700 hover:underline"
                                                >
                                                    Imprimir DANFE
                                                </a>
                                            )}
                                        </div>
                                        {recibo.nfce.chaveAcesso && (
                                            <p className="text-[10px] font-mono text-emerald-700/80 break-all">
                                                {recibo.nfce.chaveAcesso}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-1.5">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-amber-700 font-bold flex items-center gap-1.5">
                                                <AlertTriangle className="w-4 h-4" /> NFC-e pendente
                                            </span>
                                            <button
                                                onClick={handleReemitirNFCe}
                                                className="text-xs font-bold text-amber-700 hover:underline"
                                            >
                                                Tentar novamente
                                            </button>
                                        </div>
                                        {recibo.nfce.erro && (
                                            <p className="text-[11px] text-amber-700/80">
                                                {recibo.nfce.erro}
                                            </p>
                                        )}
                                        <p className="text-[11px] text-amber-700/70">
                                            A venda foi registrada normalmente.
                                        </p>
                                    </div>
                                )
                            )}
                        </div>
                        <div className="px-6 py-4 bg-gray-50">
                            <button
                                onClick={() => setRecibo(null)}
                                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold active:scale-95 transition-all"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
