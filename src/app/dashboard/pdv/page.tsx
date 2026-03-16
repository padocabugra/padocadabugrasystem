'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Minus, Trash, ShoppingCart, Search, CreditCard, User, Package } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import type { Produto } from '@/lib/types'
import { toast } from 'sonner' // Assumindo que temos sonner ou similar, senão alert/console por enquanto
// Se não tiver toast configurado, usarei alert por hora.

interface CartItem extends Produto {
    quantidadeCarrinho: number
}

export default function PDVPage() {
    const [produtos, setProdutos] = useState<Produto[]>([])
    const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([])
    const [carrinho, setCarrinho] = useState<CartItem[]>([])
    const [busca, setBusca] = useState('')
    const [categoriaAtiva, setCategoriaAtiva] = useState<string>('Todos')
    const [loading, setLoading] = useState(true)

    // Estado do Modal de Finalização
    const [modalAberto, setModalAberto] = useState(false)
    const [clienteSelecionado, setClienteSelecionado] = useState<string>('')
    const [formaPagamento, setFormaPagamento] = useState<string>('dinheiro')
    const [desconto, setDesconto] = useState<number>(0)
    const [processando, setProcessando] = useState(false)

    const supabase = createClient()

    // Buscar dados iniciais
    useEffect(() => {
        async function fetchData() {
            try {
                const [prodRes, cliRes] = await Promise.all([
                    supabase.from('produtos').select('*').eq('ativo', true).order('nome'),
                    supabase.from('clientes').select('id, nome').eq('ativo', true).order('nome'),
                ])

                if (prodRes.data) setProdutos(prodRes.data)
                if (cliRes.data) setClientes(cliRes.data)
            } catch (error) {
                console.error('Erro ao carregar dados:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [])

    // Filtragem de produtos
    const produtosFiltrados = useMemo(() => {
        return produtos.filter((p) => {
            const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase())
            const matchCat = categoriaAtiva === 'Todos' || p.categoria === categoriaAtiva
            return matchBusca && matchCat
        })
    }, [produtos, busca, categoriaAtiva])

    const categorias = useMemo(() => {
        const cats = new Set(produtos.map((p) => p.categoria).filter(Boolean))
        return ['Todos', ...Array.from(cats)].sort()
    }, [produtos])

    // Ações do Carrinho
    const adicionarAoCarrinho = (produto: Produto) => {
        setCarrinho((prev) => {
            const existente = prev.find((item) => item.id === produto.id)
            if (existente) {
                return prev.map((item) =>
                    item.id === produto.id
                        ? { ...item, quantidadeCarrinho: item.quantidadeCarrinho + 1 }
                        : item
                )
            }
            return [...prev, { ...produto, quantidadeCarrinho: 1 }]
        })
    }

    const removerDoCarrinho = (produtoId: string) => {
        setCarrinho((prev) => prev.filter((item) => item.id !== produtoId))
    }

    const atualizarQuantidade = (produtoId: string, delta: number) => {
        setCarrinho((prev) =>
            prev.map((item) => {
                if (item.id === produtoId) {
                    const novaQtd = Math.max(1, item.quantidadeCarrinho + delta)
                    return { ...item, quantidadeCarrinho: novaQtd }
                }
                return item
            })
        )
    }

    // Totais
    const subtotal = carrinho.reduce((acc, item) => acc + item.preco * item.quantidadeCarrinho, 0)
    const total = Math.max(0, subtotal - desconto)

    // Finalizar Pedido
    const handleFinalizar = async () => {
        if (carrinho.length === 0) return
        setProcessando(true)

        try {
            // 1. Criar Pedido
            const { data: pedidoData, error: pedidoError } = await supabase
                .from('pedidos')
                .insert({
                    cliente_id: clienteSelecionado || null,
                    valor_total: total,
                    desconto: desconto,
                    forma_pagamento: formaPagamento,
                    status: 'finalizado', // Já nasce finalizado no balcão
                })
                .select()
                .single()

            if (pedidoError) throw pedidoError
            const pedidoId = pedidoData.id

            // 2. Criar Itens
            const itensParaInserir = carrinho.map((item) => ({
                pedido_id: pedidoId,
                produto_id: item.id,
                quantidade: item.quantidadeCarrinho,
                valor_unitario: item.preco,
            }))

            const { error: itensError } = await supabase.from('itens_pedido').insert(itensParaInserir)

            if (itensError) throw itensError

            // 3. Atualizar Estoque (Opcional: Ideal ser via Trigger ou RPC para consistência, mas faremos no front para MVP)
            // Vou iterar e atualizar um a um por enquanto (não é atômico, mas resolve para MVP)
            // Se fosse crítico, usaria uma RPC function `finalizar_pedido`.
            for (const item of carrinho) {
                if (item.tipo !== 'proprio') { // Só baixa estoque de revenda ou matéria prima se configurado
                    // Lógica simplificada: baixa de tudo que tem controle de estoque
                    // Se produto.tipo == 'proprio', talvez não baixe estoque direto do produto, e sim dos insumos.
                    // Como não temos ficha técnica ainda, vamos baixar o estoque do produto mesmo se ele tiver controle.
                    const novoEstoque = (item.estoque_atual || 0) - item.quantidadeCarrinho
                    await supabase.from('produtos').update({ estoque_atual: novoEstoque }).eq('id', item.id)
                } else {
                    // Produção própria também baixa para controle de "o que foi vendido hoje"
                    const novoEstoque = (item.estoque_atual || 0) - item.quantidadeCarrinho
                    await supabase.from('produtos').update({ estoque_atual: novoEstoque }).eq('id', item.id)
                }
            }

            // Sucesso
            alert('Pedido realizado com sucesso!')
            setCarrinho([])
            setModalAberto(false)
            setDesconto(0)
            setClienteSelecionado('')
        } catch (error) {
            console.error(error)
            alert('Erro ao finalizar pedido. Tente novamente.')
        } finally {
            setProcessando(false)
        }
    }

    if (loading) return <div className="p-8 text-center text-gray-500">Carregando PDV...</div>

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-theme(spacing.16))] gap-4 p-4 overflow-hidden bg-gray-50/50">
            {/* Esquerda: Catálogo de Produtos */}
            <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-blue-50 overflow-hidden">
                {/* Header Busca */}
                <div className="p-4 border-b border-blue-50 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar produto (nome, código)..."
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                            autoFocus
                        />
                    </div>
                    {/* Categorias */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        {categorias.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setCategoriaAtiva(cat)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${categoriaAtiva === cat
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid Produtos */}
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {produtosFiltrados.map((produto) => (
                            <div
                                key={produto.id}
                                onClick={() => adicionarAoCarrinho(produto)}
                                className="group relative bg-white border border-gray-100 rounded-lg p-3 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between items-start"
                            >
                                <div className="w-full mb-2">
                                    <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">{produto.categoria}</span>
                                    <h3 className="font-semibold text-gray-800 text-sm leading-snug line-clamp-2">{produto.nome}</h3>
                                </div>
                                <div className="w-full flex items-center justify-between mt-auto">
                                    <span className="font-bold text-primary text-sm">{formatCurrency(produto.preco)}</span>
                                    <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Plus className="w-4 h-4" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {produtosFiltrados.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <Package className="w-10 h-10 mb-2 opacity-20" />
                            <p>Nenhum produto encontrado</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Direita: Carrinho */}
            <div className="w-full md:w-96 bg-white rounded-xl shadow-sm border border-blue-50 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-blue-50 bg-blue-50/20 flex items-center justify-between">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-primary" />
                        Carrinho
                    </h2>
                    <button
                        onClick={() => setCarrinho([])}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        disabled={carrinho.length === 0}
                    >
                        Limpar
                    </button>
                </div>

                {/* Lista Itens */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {carrinho.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                            <ShoppingCart className="w-8 h-8 mb-2 opacity-20" />
                            <p>Seu carrinho está vazio</p>
                        </div>
                    ) : (
                        carrinho.map(item => (
                            <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-transparent hover:border-blue-100">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-gray-800 truncate">{item.nome}</p>
                                    <p className="text-xs text-gray-500">{formatCurrency(item.preco)} un</p>
                                </div>
                                <div className="flex items-center gap-2 bg-white rounded border border-gray-200 px-1 py-0.5">
                                    <button onClick={() => atualizarQuantidade(item.id, -1)} className="p-0.5 hover:bg-gray-100 rounded text-gray-600"><Minus className="w-3 h-3" /></button>
                                    <span className="text-xs font-semibold w-6 text-center">{item.quantidadeCarrinho}</span>
                                    <button onClick={() => atualizarQuantidade(item.id, 1)} className="p-0.5 hover:bg-gray-100 rounded text-gray-600"><Plus className="w-3 h-3" /></button>
                                </div>
                                <button onClick={() => removerDoCarrinho(item.id)} className="text-gray-400 hover:text-red-500 p-1">
                                    <Trash className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Resumo e Ação */}
                <div className="p-4 bg-gray-50 border-t border-blue-50 space-y-4">
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span>{formatCurrency(subtotal)}</span>
                        </div>
                        {desconto > 0 && (
                            <div className="flex justify-between text-green-600">
                                <span>Desconto</span>
                                <span>- {formatCurrency(desconto)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-bold text-lg text-gray-800 pt-2 border-t border-gray-200">
                            <span>Total</span>
                            <span>{formatCurrency(Math.max(0, total))}</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setModalAberto(true)}
                        disabled={carrinho.length === 0}
                        className="w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                    >
                        Finalizar Venda (F2)
                    </button>
                </div>
            </div>

            {/* Modal Finalização */}
            {modalAberto && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b flex justify-between items-center bg-blue-50/50">
                            <h3 className="font-bold text-lg text-gray-800">Pagamento</h3>
                            <button onClick={() => setModalAberto(false)} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Cliente */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (Opcional)</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <select
                                        value={clienteSelecionado}
                                        onChange={(e) => setClienteSelecionado(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100 outline-none"
                                    >
                                        <option value="">Consumidor Final</option>
                                        {clientes.map(c => (
                                            <option key={c.id} value={c.id}>{c.nome}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Pagamento */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {['dinheiro', 'pix', 'debito', 'credito'].map(tipo => (
                                        <button
                                            key={tipo}
                                            onClick={() => setFormaPagamento(tipo)}
                                            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${formaPagamento === tipo
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            {tipo}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Desconto */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Desconto (R$)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={desconto}
                                    onChange={(e) => setDesconto(Number(e.target.value))}
                                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                                    placeholder="0,00"
                                />
                            </div>

                            <div className="pt-2 text-right">
                                <p className="text-sm text-gray-500">Total a Pagar</p>
                                <p className="text-2xl font-bold text-primary">{formatCurrency(total)}</p>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => setModalAberto(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleFinalizar}
                                disabled={processando}
                                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {processando ? 'Processando...' : 'Confirmar Pagamento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
