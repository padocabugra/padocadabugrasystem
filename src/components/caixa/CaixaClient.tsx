'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import { toast } from 'sonner'
import {
    Search, Receipt, Banknote, CreditCard, Smartphone, ArrowDownCircle,
    ArrowUpCircle, ChevronRight, RefreshCw, CheckCircle2, X,
    DollarSign, Clock, AlertTriangle, Hash, User, Star
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ItemPedidoPDV {
    id: string
    quantidade: number
    preco_unitario: number
    subtotal: number
    produto: { nome: string } | null
}

interface PedidoPDV {
    id: string
    numero_mesa: number | null
    total: number
    status: string
    created_at: string
    cliente: { nome: string } | null
    itens_pedido: ItemPedidoPDV[]
}

interface Props {
    usuarioId: string
    usuarioNome: string
    aberturaHoje: { id: string; valor: number; saldo: number; created_at: string } | null
    saldoAtual: number | null
    pedidosProntosIniciais: PedidoPDV[]
}

type FormaPagamento = 'dinheiro' | 'pix' | 'debito' | 'credito'

interface DadosRecibo {
    pedidoId: string
    mesa: number | null
    clienteNome: string | null
    itens: ItemPedidoPDV[]
    total: number
    valorPago: number
    troco: number
    formaPagamento: FormaPagamento
    pontosGanhos: number
    dataHora: string
}

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string; icon: React.ReactNode }[] = [
    { value: 'dinheiro', label: 'Dinheiro', icon: <Banknote className="w-5 h-5" /> },
    { value: 'pix', label: 'PIX', icon: <Smartphone className="w-5 h-5" /> },
    { value: 'debito', label: 'Débito', icon: <CreditCard className="w-5 h-5" /> },
    { value: 'credito', label: 'Crédito', icon: <CreditCard className="w-5 h-5" /> },
]

const FORMA_LABEL: Record<FormaPagamento, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    debito: 'Cartão Débito',
    credito: 'Cartão Crédito',
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function tempoDecorrido(created_at: string): string {
    const diff = Date.now() - new Date(created_at).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}min`
    return `${Math.floor(mins / 60)}h${mins % 60}min`
}

// ─── Componente Principal ────────────────────────────────────────────────────

export default function CaixaClient({
    usuarioId,
    usuarioNome,
    aberturaHoje: aberturaHojeInicial,
    saldoAtual: saldoInicialProp,
    pedidosProntosIniciais,
}: Props) {
    const supabase = createClient()

    // Estado de abertura do caixa
    const [aberturaHoje, setAberturaHoje] = useState(aberturaHojeInicial)
    const [saldoAtual, setSaldoAtual] = useState<number>(saldoInicialProp ?? 0)
    const [modalAbertura, setModalAbertura] = useState(!aberturaHojeInicial)
    const [valorAbertura, setValorAbertura] = useState('')
    const [processandoAbertura, setProcessandoAbertura] = useState(false)

    // Estado do PDV
    const [pedidos, setPedidos] = useState<PedidoPDV[]>(pedidosProntosIniciais)
    const [busca, setBusca] = useState('')
    const [pedidoSelecionado, setPedidoSelecionado] = useState<PedidoPDV | null>(null)
    const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('dinheiro')
    const [valorRecebido, setValorRecebido] = useState('')
    const [processandoVenda, setProcessandoVenda] = useState(false)
    const [carregandoPedidos, setCarregandoPedidos] = useState(false)

    // Modal Cupom Digital
    const [reciboAtual, setReciboAtual] = useState<DadosRecibo | null>(null)

    // Modal Sangria / Reforço
    const [modalMovimentacao, setModalMovimentacao] = useState<'sangria' | 'reforco' | null>(null)
    const [valorMovimentacao, setValorMovimentacao] = useState('')
    const [obsMovimentacao, setObsMovimentacao] = useState('')
    const [processandoMov, setProcessandoMov] = useState(false)

    // ── Carregar pedidos prontos ──────────────────────────────────────────────

    const carregarPedidosProntos = useCallback(async () => {
        setCarregandoPedidos(true)
        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                id, numero_mesa, total, status, created_at,
                cliente:clientes ( nome ),
                itens_pedido (
                    id, quantidade, preco_unitario, subtotal,
                    produto:produtos ( nome )
                )
            `)
            .eq('status', 'pronto')
            .order('created_at', { ascending: true })

        if (error) {
            toast.error('Erro ao carregar pedidos')
        } else {
            setPedidos((data ?? []) as any)
            // Se o pedido selecionado foi finalizado, limpa seleção
            if (pedidoSelecionado) {
                const ainda = (data ?? []).find((p: any) => p.id === pedidoSelecionado.id)
                if (!ainda) setPedidoSelecionado(null)
            }
        }
        setCarregandoPedidos(false)
    }, [pedidoSelecionado, supabase])

    // Polling a cada 30s para atualizar pedidos prontos
    useEffect(() => {
        const interval = setInterval(carregarPedidosProntos, 30000)
        return () => clearInterval(interval)
    }, [carregarPedidosProntos])

    // ── Filtro de busca ───────────────────────────────────────────────────────

    const pedidosFiltrados = pedidos.filter((p) => {
        if (!busca) return true
        const termo = busca.toLowerCase()
        const mesaMatch = p.numero_mesa?.toString().includes(termo)
        const clienteMatch = p.cliente?.nome.toLowerCase().includes(termo)
        return mesaMatch || clienteMatch
    })

    // ── Cálculo troco ─────────────────────────────────────────────────────────

    const valorRecebidoNum = parseFloat(valorRecebido.replace(',', '.')) || 0
    const troco = formaPagamento === 'dinheiro'
        ? Math.max(0, valorRecebidoNum - (pedidoSelecionado?.total ?? 0))
        : 0

    // ── Abertura de Caixa ─────────────────────────────────────────────────────

    async function handleAbrirCaixa() {
        const valor = parseFloat(valorAbertura.replace(',', '.'))
        if (isNaN(valor) || valor < 0) {
            toast.error('Informe um valor válido para o fundo de troco')
            return
        }
        setProcessandoAbertura(true)
        try {
            const { data, error } = await supabase
                .from('caixa')
                .insert({
                    usuario_id: usuarioId,
                    tipo: 'abertura',
                    valor: valor,
                    saldo: valor,
                    observacao: `Abertura por ${usuarioNome}`,
                })
                .select('id, valor, saldo, created_at')
                .single()

            if (error) throw error
            setAberturaHoje(data)
            setSaldoAtual(data.saldo)
            setModalAbertura(false)
            toast.success(`Caixa aberto com fundo de ${formatCurrency(valor)}`)
        } catch (err: any) {
            toast.error('Erro ao abrir caixa: ' + err.message)
        } finally {
            setProcessandoAbertura(false)
        }
    }

    // ── Finalizar Venda ───────────────────────────────────────────────────────

    async function handleFinalizarVenda() {
        if (!pedidoSelecionado || !aberturaHoje) return

        const valorPago = formaPagamento === 'dinheiro'
            ? valorRecebidoNum
            : pedidoSelecionado.total

        if (formaPagamento === 'dinheiro' && valorPago < pedidoSelecionado.total) {
            toast.error('Valor recebido menor que o total do pedido')
            return
        }

        setProcessandoVenda(true)
        try {
            const { data, error } = await supabase.rpc('finalizar_venda_pdv', {
                p_pedido_id: pedidoSelecionado.id,
                p_forma_pagamento: formaPagamento,
                p_valor_pago: valorPago,
                p_usuario_id: usuarioId,
            })

            if (error) throw error

            setSaldoAtual((prev) => prev + pedidoSelecionado.total)

            // Calcula pontos de fidelidade (mesma lógica do trigger: floor(total / 10))
            const pontosGanhos = pedidoSelecionado.cliente
                ? Math.max(Math.floor(pedidoSelecionado.total / 10), 0)
                : 0

            // Monta dados do Cupom Digital
            const recibo: DadosRecibo = {
                pedidoId: pedidoSelecionado.id,
                mesa: pedidoSelecionado.numero_mesa,
                clienteNome: pedidoSelecionado.cliente?.nome ?? null,
                itens: pedidoSelecionado.itens_pedido,
                total: pedidoSelecionado.total,
                valorPago: valorPago,
                troco: Math.max(0, valorPago - pedidoSelecionado.total),
                formaPagamento,
                pontosGanhos,
                dataHora: new Date().toLocaleString('pt-BR'),
            }

            setReciboAtual(recibo)
            setPedidoSelecionado(null)
            setFormaPagamento('dinheiro')
            setValorRecebido('')
            await carregarPedidosProntos()
        } catch (err: any) {
            toast.error('Erro ao finalizar venda: ' + err.message)
        } finally {
            setProcessandoVenda(false)
        }
    }

    // ── Sangria / Reforço ─────────────────────────────────────────────────────

    async function handleMovimentacao() {
        if (!modalMovimentacao || !aberturaHoje) return
        const valor = parseFloat(valorMovimentacao.replace(',', '.'))
        if (isNaN(valor) || valor <= 0) {
            toast.error('Informe um valor válido')
            return
        }
        setProcessandoMov(true)
        try {
            const novoSaldo = modalMovimentacao === 'sangria'
                ? saldoAtual - valor
                : saldoAtual + valor

            const { error } = await supabase.from('caixa').insert({
                usuario_id: usuarioId,
                tipo: modalMovimentacao,
                valor: valor,
                saldo: novoSaldo,
                observacao: obsMovimentacao || null,
            })

            if (error) throw error
            setSaldoAtual(novoSaldo)
            toast.success(
                modalMovimentacao === 'sangria'
                    ? `Sangria de ${formatCurrency(valor)} registrada`
                    : `Reforço de ${formatCurrency(valor)} registrado`
            )
            setModalMovimentacao(null)
            setValorMovimentacao('')
            setObsMovimentacao('')
        } catch (err: any) {
            toast.error('Erro: ' + err.message)
        } finally {
            setProcessandoMov(false)
        }
    }

    // ── Fechar Cupom Digital e resetar PDV ─────────────────────────────────

    function handleNovoAtendimento() {
        setReciboAtual(null)
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            {/* ── Modal Cupom Digital (Recibo) ── */}
            {reciboAtual && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in-0 zoom-in-95">
                        {/* Header do Recibo */}
                        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white text-center">
                            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-90" />
                            <h2 className="text-lg font-bold">Venda Finalizada!</h2>
                            <p className="text-emerald-200 text-xs mt-0.5">{reciboAtual.dataHora}</p>
                        </div>

                        {/* Corpo do Cupom */}
                        <div className="px-6 py-5 space-y-4">
                            {/* Número do Pedido / Mesa / Cliente */}
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500 font-medium">Pedido</span>
                                <span className="font-bold text-gray-800 font-mono text-xs">
                                    #{reciboAtual.pedidoId.slice(0, 8).toUpperCase()}
                                </span>
                            </div>
                            {reciboAtual.mesa && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500 font-medium">Mesa</span>
                                    <span className="font-bold text-gray-800">{reciboAtual.mesa}</span>
                                </div>
                            )}
                            {reciboAtual.clienteNome && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500 font-medium">Cliente</span>
                                    <span className="font-bold text-gray-800">{reciboAtual.clienteNome}</span>
                                </div>
                            )}

                            {/* Separador */}
                            <div className="border-t border-dashed border-gray-200" />

                            {/* Lista de Itens */}
                            <div className="space-y-2">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Itens</p>
                                {reciboAtual.itens.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 w-6 h-6 rounded flex items-center justify-center">
                                                {item.quantidade}x
                                            </span>
                                            <span className="text-gray-700 font-medium">{item.produto?.nome ?? 'Produto'}</span>
                                        </div>
                                        <span className="font-bold text-gray-800">{formatCurrency(item.subtotal)}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Separador */}
                            <div className="border-t border-dashed border-gray-200" />

                            {/* Total */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-500">Total</span>
                                <span className="text-xl font-black text-gray-900">{formatCurrency(reciboAtual.total)}</span>
                            </div>

                            {/* Forma de Pagamento */}
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500 font-medium">Pagamento</span>
                                <span className="font-bold text-gray-800">{FORMA_LABEL[reciboAtual.formaPagamento]}</span>
                            </div>

                            {/* Troco (apenas dinheiro com troco > 0) */}
                            {reciboAtual.formaPagamento === 'dinheiro' && reciboAtual.troco > 0 && (
                                <div className="flex items-center justify-between text-sm bg-blue-50 px-3 py-2 rounded-lg">
                                    <span className="text-blue-600 font-medium">Troco</span>
                                    <span className="font-bold text-blue-700">{formatCurrency(reciboAtual.troco)}</span>
                                </div>
                            )}

                            {/* Pontos de Fidelidade */}
                            {reciboAtual.pontosGanhos > 0 && (
                                <div className="flex items-center justify-between text-sm bg-blue-50 px-3 py-2 rounded-lg">
                                    <span className="text-blue-700 font-medium flex items-center gap-1.5"><Star className="w-4 h-4" /> Pontos de Fidelidade</span>
                                    <span className="font-extrabold text-blue-700">+{reciboAtual.pontosGanhos} pts</span>
                                </div>
                            )}
                        </div>

                        {/* Botão Novo Atendimento */}
                        <div className="px-6 pb-6">
                            <button
                                onClick={handleNovoAtendimento}
                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-sm transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Novo Atendimento
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Modal Obrigatório de Abertura de Caixa ── */}
            {modalAbertura && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                            <div className="flex items-center gap-3 mb-1">
                                <DollarSign className="w-6 h-6 opacity-80" />
                                <h2 className="text-lg font-bold">Abertura de Caixa</h2>
                            </div>
                            <p className="text-blue-200 text-sm">
                                Informe o fundo de troco para iniciar o turno.
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Valor Inicial (Fundo de Troco)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">R$</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="0,00"
                                        value={valorAbertura}
                                        onChange={(e) => setValorAbertura(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAbrirCaixa()}
                                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl text-base font-semibold focus:border-blue-500 focus:ring-0 outline-none transition-colors"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleAbrirCaixa}
                                disabled={processandoAbertura}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {processandoAbertura ? (
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                    <CheckCircle2 className="w-4 h-4" />
                                )}
                                Abrir Caixa
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Sangria / Reforço ── */}
            {modalMovimentacao && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className={`px-6 py-4 flex items-center justify-between ${modalMovimentacao === 'sangria' ? 'bg-red-50' : 'bg-emerald-50'}`}>
                            <h3 className={`font-bold text-base ${modalMovimentacao === 'sangria' ? 'text-red-700' : 'text-emerald-700'}`}>
                                {modalMovimentacao === 'sangria' ? '↓ Sangria de Caixa' : '↑ Reforço de Caixa'}
                            </h3>
                            <button
                                onClick={() => { setModalMovimentacao(null); setValorMovimentacao(''); setObsMovimentacao('') }}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Valor (R$)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        placeholder="0,00"
                                        value={valorMovimentacao}
                                        onChange={(e) => setValorMovimentacao(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Observação (opcional)</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Troco para cliente..."
                                    value={obsMovimentacao}
                                    onChange={(e) => setObsMovimentacao(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                                />
                            </div>
                            <button
                                onClick={handleMovimentacao}
                                disabled={processandoMov}
                                className={`w-full py-2.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 ${modalMovimentacao === 'sangria' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                            >
                                {processandoMov ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Layout Principal ── */}
            <div className="flex flex-col h-[calc(100vh-theme(spacing.16)-theme(spacing.12))] gap-0 -m-6">

                {/* Header do Caixa */}
                <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-blue-100 shrink-0">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-base font-extrabold text-gray-900 leading-none">PDV & Caixa</h1>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {aberturaHoje
                                    ? `Caixa aberto · Saldo: ${formatCurrency(saldoAtual)}`
                                    : 'Caixa não iniciado'
                                }
                            </p>
                        </div>
                        {aberturaHoje && (
                            <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                Aberto
                            </span>
                        )}
                    </div>

                    {/* Ações do Caixa */}
                    {aberturaHoje && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setModalMovimentacao('sangria')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                            >
                                <ArrowDownCircle className="w-3.5 h-3.5" />
                                Sangria
                            </button>
                            <button
                                onClick={() => setModalMovimentacao('reforco')}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                            >
                                <ArrowUpCircle className="w-3.5 h-3.5" />
                                Reforço
                            </button>
                            <button
                                onClick={carregarPedidosProntos}
                                disabled={carregandoPedidos}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Atualizar pedidos prontos"
                            >
                                <RefreshCw className={`w-4 h-4 ${carregandoPedidos ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    )}
                </header>

                {/* ── Tela dividida: Pedidos | Conta ── */}
                <div className="flex flex-1 overflow-hidden">

                    {/* ════ LADO ESQUERDO: Lista de Pedidos Prontos ════ */}
                    <div className="flex flex-col w-[340px] xl:w-[380px] shrink-0 border-r border-blue-50 bg-white overflow-hidden">
                        {/* Busca */}
                        <div className="p-3 border-b border-blue-50">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por Mesa ou Cliente..."
                                    value={busca}
                                    onChange={(e) => setBusca(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                                />
                            </div>
                        </div>

                        {/* Legenda */}
                        <div className="px-3 py-2 flex items-center justify-between">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                Prontos para Pagar
                            </p>
                            <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">
                                {pedidosFiltrados.length}
                            </span>
                        </div>

                        {/* Lista */}
                        <div className="flex-1 overflow-y-auto space-y-1 px-2 pb-2">
                            {pedidosFiltrados.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-300">
                                    <CheckCircle2 className="w-10 h-10" />
                                    <p className="text-sm font-medium">Nenhum pedido pronto</p>
                                    <p className="text-xs text-center">Os pedidos marcados como prontos<br />na cozinha aparecerão aqui</p>
                                </div>
                            ) : (
                                pedidosFiltrados.map((pedido) => (
                                    <button
                                        key={pedido.id}
                                        onClick={() => {
                                            setPedidoSelecionado(pedido)
                                            setFormaPagamento('dinheiro')
                                            setValorRecebido('')
                                        }}
                                        className={`w-full text-left p-3 rounded-xl border transition-all ${pedidoSelecionado?.id === pedido.id
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                            : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-blue-50/40'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${pedidoSelecionado?.id === pedido.id ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                                    {pedido.numero_mesa ? (
                                                        <Hash className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <User className="w-3.5 h-3.5" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-bold leading-none ${pedidoSelecionado?.id === pedido.id ? 'text-white' : 'text-gray-800'}`}>
                                                        {pedido.numero_mesa ? `Mesa ${pedido.numero_mesa}` : (pedido.cliente?.nome ?? 'Balcão')}
                                                    </p>
                                                    <p className={`text-xs mt-0.5 flex items-center gap-1 ${pedidoSelecionado?.id === pedido.id ? 'text-blue-200' : 'text-gray-400'}`}>
                                                        <Clock className="w-3 h-3" />
                                                        {tempoDecorrido(pedido.created_at)}
                                                        {' · '}
                                                        {pedido.itens_pedido.length} iten{pedido.itens_pedido.length !== 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-sm font-extrabold ${pedidoSelecionado?.id === pedido.id ? 'text-white' : 'text-blue-700'}`}>
                                                    {formatCurrency(pedido.total)}
                                                </span>
                                                <ChevronRight className={`w-4 h-4 ${pedidoSelecionado?.id === pedido.id ? 'text-blue-200' : 'text-gray-300'}`} />
                                            </div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ════ LADO DIREITO: Detalhes da Conta ════ */}
                    <div className="flex-1 flex flex-col bg-gray-50/50 overflow-hidden">
                        {!pedidoSelecionado ? (
                            /* Estado vazio */
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-300 p-8">
                                <Receipt className="w-16 h-16" />
                                <p className="text-lg font-semibold">Selecione um pedido</p>
                                <p className="text-sm text-center">
                                    Escolha um pedido na lista para<br />visualizar a conta e realizar o pagamento.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full overflow-hidden">

                                {/* Cabeçalho da Conta */}
                                <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-blue-50">
                                    <div>
                                        <h2 className="font-extrabold text-gray-900 text-base">
                                            {pedidoSelecionado.numero_mesa
                                                ? `Mesa ${pedidoSelecionado.numero_mesa}`
                                                : (pedidoSelecionado.cliente?.nome ?? 'Balcão')
                                            }
                                        </h2>
                                        <p className="text-xs text-gray-400 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Aguardando há {tempoDecorrido(pedidoSelecionado.created_at)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setPedidoSelecionado(null)}
                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Itens do Pedido */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                                    {pedidoSelecionado.itens_pedido.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-blue-50">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-blue-600 bg-blue-50 w-7 h-7 rounded-lg flex items-center justify-center">
                                                    {item.quantidade}x
                                                </span>
                                                <span className="text-sm font-medium text-gray-800">
                                                    {item.produto?.nome ?? 'Produto'}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-gray-800">{formatCurrency(item.subtotal)}</p>
                                                <p className="text-xs text-gray-400">{formatCurrency(item.preco_unitario)} un</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Painel de Pagamento */}
                                <div className="bg-white border-t border-blue-100 p-4 space-y-4">
                                    {/* Total */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-gray-500">Total da Conta</span>
                                        <span className="text-2xl font-black text-gray-900">
                                            {formatCurrency(pedidoSelecionado.total)}
                                        </span>
                                    </div>

                                    {/* Forma de Pagamento */}
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Forma de Pagamento</p>
                                        <div className="grid grid-cols-4 gap-2">
                                            {FORMAS_PAGAMENTO.map(({ value, label, icon }) => (
                                                <button
                                                    key={value}
                                                    onClick={() => {
                                                        setFormaPagamento(value)
                                                        setValorRecebido('')
                                                    }}
                                                    className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all ${formaPagamento === value
                                                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                                                        }`}
                                                >
                                                    {icon}
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Valor Recebido (somente dinheiro) */}
                                    {formaPagamento === 'dinheiro' && (
                                        <div className="space-y-2">
                                            <div>
                                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Recebido</label>
                                                <div className="relative mt-1">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">R$</span>
                                                    <input
                                                        type="number"
                                                        min={pedidoSelecionado.total}
                                                        step="0.01"
                                                        placeholder={pedidoSelecionado.total.toFixed(2)}
                                                        value={valorRecebido}
                                                        onChange={(e) => setValorRecebido(e.target.value)}
                                                        className="w-full pl-10 pr-3 py-2.5 border-2 border-gray-200 focus:border-blue-400 rounded-xl text-base font-bold outline-none transition-colors"
                                                    />
                                                </div>
                                            </div>
                                            {/* Troco em tempo real */}
                                            {valorRecebidoNum > 0 && (
                                                <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl font-bold ${troco >= 0
                                                    ? 'bg-emerald-50 text-emerald-700'
                                                    : 'bg-red-50 text-red-700'
                                                    }`}>
                                                    <div className="flex items-center gap-2">
                                                        {troco >= 0 ? (
                                                            <CheckCircle2 className="w-4 h-4" />
                                                        ) : (
                                                            <AlertTriangle className="w-4 h-4" />
                                                        )}
                                                        <span className="text-sm">
                                                            {troco >= 0 ? 'Troco' : 'Falta'}
                                                        </span>
                                                    </div>
                                                    <span className="text-lg">
                                                        {formatCurrency(Math.abs(troco))}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Botão Finalizar */}
                                    <button
                                        onClick={handleFinalizarVenda}
                                        disabled={
                                            processandoVenda ||
                                            !aberturaHoje ||
                                            (formaPagamento === 'dinheiro' && (valorRecebidoNum < pedidoSelecionado.total || !valorRecebido))
                                        }
                                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl font-extrabold text-base transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                                    >
                                        {processandoVenda ? (
                                            <><RefreshCw className="w-5 h-5 animate-spin" /> Processando...</>
                                        ) : (
                                            <><CheckCircle2 className="w-5 h-5" /> Finalizar Venda</>
                                        )}
                                    </button>

                                    {!aberturaHoje && (
                                        <p className="text-center text-xs text-red-500 font-medium flex items-center justify-center gap-1.5">
                                            <AlertTriangle className="w-4 h-4" /> O caixa precisa estar aberto para registrar vendas.
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
