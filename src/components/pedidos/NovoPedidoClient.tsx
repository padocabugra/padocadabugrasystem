'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import BuscaClienteCPF from '@/components/pedidos/BuscaClienteCPF'
import CatalogoProdutos from '@/components/pedidos/CatalogoProdutos'
import CarrinhoLateral from '@/components/pedidos/CarrinhoLateral'
import type { Produto } from '@/lib/types'
import type { ItemCarrinho, TipoPedido } from '@/lib/types/pedidos'
import { ShoppingCart as CartIcon, MapPin, Truck, UserX } from 'lucide-react'

interface NovoPedidoClientProps {
    produtos: Produto[]
    vendedorId: string
    tipoInicial?: TipoPedido
}

interface ClienteSelecionado {
    id: string
    nome: string
    cpf: string
    whatsapp: string | null
    pontos_fidelidade: number
}

export default function NovoPedidoClient({ produtos, vendedorId, tipoInicial = 'local' }: NovoPedidoClientProps) {
    const [cliente, setCliente] = useState<ClienteSelecionado | null>(null)
    const [vendaAvulsa, setVendaAvulsa] = useState(false)
    const [tipoPedido, setTipoPedido] = useState<TipoPedido>(tipoInicial)
    const [numeroMesa, setNumeroMesa] = useState<string>('')
    const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)

    // ── Gerenciamento do Carrinho ──
    const handleAddProduto = useCallback((produto: Produto) => {
        setCarrinho((prev) => {
            const existente = prev.find((i) => i.produto_id === produto.id)
            if (existente) {
                return prev.map((i) =>
                    i.produto_id === produto.id
                        ? { ...i, quantidade: i.quantidade + 1 }
                        : i
                )
            }
            return [
                ...prev,
                {
                    produto_id: produto.id,
                    nome: produto.nome,
                    preco: Number(produto.preco),
                    quantidade: 1,
                },
            ]
        })
    }, [])

    const handleAddById = useCallback((produto_id: string) => {
        setCarrinho((prev) =>
            prev.map((i) =>
                i.produto_id === produto_id
                    ? { ...i, quantidade: i.quantidade + 1 }
                    : i
            )
        )
    }, [])

    const handleRemoveById = useCallback((produto_id: string) => {
        setCarrinho((prev) => {
            const item = prev.find((i) => i.produto_id === produto_id)
            if (!item) return prev
            if (item.quantidade === 1) return prev.filter((i) => i.produto_id !== produto_id)
            return prev.map((i) =>
                i.produto_id === produto_id
                    ? { ...i, quantidade: i.quantidade - 1 }
                    : i
            )
        })
    }, [])

    function handleVendaAvulsa() {
        setVendaAvulsa(true)
        setCliente(null)
    }

    function handleCancelarAvulsa() {
        setVendaAvulsa(false)
    }

    // ── Submissão ──
    async function handleSubmit() {
        if (carrinho.length === 0) {
            toast.error('Adicione pelo menos um item ao pedido.')
            return
        }

        const total = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
        const mesa = tipoPedido === 'local' && numeroMesa ? parseInt(numeroMesa, 10) : null

        setIsSubmitting(true)

        const supabase = createClient()
        const { data, error } = await supabase.rpc('create_pedido_completo', {
            p_cliente_id: vendaAvulsa ? null : (cliente?.id ?? null),
            p_numero_mesa: mesa,
            p_vendedor_id: vendedorId,
            p_total: total,
            p_tipo_pedido: tipoPedido,
            p_itens: carrinho.map((i) => ({
                produto_id: i.produto_id,
                quantidade: i.quantidade,
                preco_unitario: i.preco,
            })),
        })

        setIsSubmitting(false)

        if (error) {
            toast.error('Erro ao enviar pedido. Tente novamente.', { description: error.message })
            return
        }

        const tipoLabel = tipoPedido === 'delivery' ? '🛵 Delivery' : '🍞 Local'
        toast.success(`Pedido ${tipoLabel} enviado para a cozinha!`, {
            description: `Pedido #${(data as any)?.pedido_id?.slice(0, 8).toUpperCase()} criado com sucesso.`,
        })

        // Reset completo para próximo atendimento
        setCliente(null)
        setVendaAvulsa(false)
        setNumeroMesa('')
        setCarrinho([])
    }

    return (
        <div className="flex flex-col lg:flex-row gap-4 h-full min-h-[calc(100vh-8rem)]">

            {/* ── Coluna Esquerda: Formulário + Catálogo ── */}
            <div className="flex flex-col gap-5 flex-1 min-w-0">

                {/* Seção 0: Tipo de Pedido (Local / Delivery) */}
                <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Tipo do Pedido</p>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setTipoPedido('local')}
                            className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm border-2 transition-all ${tipoPedido === 'local'
                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                        >
                            <MapPin className="w-4 h-4" />
                            Local (Mesa/Balcão)
                        </button>
                        <button
                            type="button"
                            onClick={() => { setTipoPedido('delivery'); setNumeroMesa('') }}
                            className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm border-2 transition-all ${tipoPedido === 'delivery'
                                ? 'bg-[#054F77] border-[#054F77] text-white shadow-lg shadow-blue-200'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                        >
                            <Truck className="w-4 h-4" />
                            Delivery
                        </button>
                    </div>
                </div>

                {/* Seção 1: Cliente */}
                <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm">
                    {vendaAvulsa ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                                    <UserX className="w-5 h-5 text-gray-400" />
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800">Venda Avulsa</p>
                                    <p className="text-xs text-gray-400">Cliente não identificado</p>
                                </div>
                            </div>
                            <button
                                onClick={handleCancelarAvulsa}
                                className="text-xs text-blue-600 font-semibold hover:underline"
                            >
                                Identificar cliente
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <BuscaClienteCPF
                                onClienteSelect={setCliente}
                                clienteSelecionado={cliente}
                            />
                            {!cliente && (
                                <button
                                    onClick={handleVendaAvulsa}
                                    className="w-full py-2.5 border-2 border-dashed border-gray-200 text-gray-500
                                               rounded-xl text-xs font-semibold hover:border-gray-300 hover:text-gray-600
                                               transition-colors flex items-center justify-center gap-2"
                                >
                                    <UserX className="w-3.5 h-3.5" />
                                    Venda Avulsa (sem cadastro)
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Seção 2: Mesa (somente para pedidos locais) */}
                {tipoPedido === 'local' && (
                    <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm">
                        <p className="text-sm font-semibold text-gray-700 mb-3">Número da Mesa</p>
                        <input
                            type="number"
                            min={1}
                            max={99}
                            placeholder="— (opcional, ex: 5)"
                            value={numeroMesa}
                            onChange={(e) => setNumeroMesa(e.target.value)}
                            className="w-full h-14 px-4 rounded-xl border border-blue-100 bg-white text-center
                                       text-2xl font-bold text-primary focus:outline-none focus:ring-2
                                       focus:ring-primary/40 placeholder:text-gray-300 placeholder:text-base
                                       placeholder:font-normal"
                            inputMode="numeric"
                        />
                    </div>
                )}

                {/* Badge Delivery visual */}
                {tipoPedido === 'delivery' && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                        <Truck className="w-4 h-4 text-primary" />
                        <span className="text-sm font-bold text-primary">Pedido Delivery — Será destacado na cozinha</span>
                    </div>
                )}

                {/* Seção 3: Catálogo */}
                <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm flex-1">
                    <CatalogoProdutos
                        produtos={produtos}
                        onAddProduto={handleAddProduto}
                    />
                </div>
            </div>

            {/* ── Coluna Direita: Carrinho (fixo em tablet/desktop) ── */}
            <div className="w-full lg:w-80 xl:w-96 shrink-0 lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]">
                <CarrinhoLateral
                    itens={carrinho}
                    onAdd={handleAddById}
                    onRemove={handleRemoveById}
                    onSubmit={handleSubmit}
                    isSubmitting={isSubmitting}
                />
                {/* ── Botão Flutuante (Mobile Only) ── */}
                {carrinho.length > 0 && (
                    <button
                        onClick={() => {
                            const cartEl = document.getElementById('carrinho-lateral')
                            cartEl?.scrollIntoView({ behavior: 'smooth' })
                        }}
                        className="lg:hidden fixed bottom-6 right-6 w-16 h-16 bg-primary text-white rounded-full 
                               shadow-[0_8px_30px_rgb(30,58,138,0.4)] flex items-center justify-center z-40 
                               active:scale-95 transition-transform border-4 border-white"
                    >
                        <CartIcon className="w-6 h-6" />
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black 
                                     w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">
                            {carrinho.reduce((acc, i) => acc + i.quantidade, 0)}
                        </span>
                    </button>
                )}
            </div>
        </div>
    )
}
