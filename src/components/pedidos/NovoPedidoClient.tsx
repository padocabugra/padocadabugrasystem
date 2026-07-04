'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import BuscaClienteCPF from '@/components/pedidos/BuscaClienteCPF'
import BuscaClienteNome from '@/components/pedidos/BuscaClienteNome'
import CatalogoProdutos from '@/components/pedidos/CatalogoProdutos'
import CarrinhoLateral from '@/components/pedidos/CarrinhoLateral'
import ModalPesagem from '@/components/pedidos/ModalPesagem'
import type { Produto } from '@/lib/types'
import type { ItemCarrinho, TipoPedido, DestinoPedido } from '@/lib/types/pedidos'
import { ShoppingCart as CartIcon, MapPin, Truck, UserX, CreditCard, X, User, Zap, Search, UserSearch, Ban, UtensilsCrossed, Hash } from 'lucide-react'

// Gerador local de id pra cart_item_id. crypto.randomUUID() existe em todos os
// browsers modernos. Fallback de timestamp evita explodir em ambientes velhos.
function novoCartItemId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID()
    }
    return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface Comanda {
    id: string
    numero: number
    status: 'livre' | 'consumo' | 'bloqueada'
}

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
    // modoCliente: qual card de identificação está ativo (opções mutuamente exclusivas)
    const [modoCliente, setModoCliente] = useState<'balcao' | 'avulsa' | 'cpf' | 'nome'>('balcao')
    const [tipoPedido, setTipoPedido] = useState<TipoPedido>(tipoInicial)
    const [numeroMesa, setNumeroMesa] = useState<string>('')
    const [observacoes, setObservacoes] = useState('')
    const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
    const [destino, setDestino] = useState<DestinoPedido>('cozinha')
    const [isSubmitting, setIsSubmitting] = useState(false)

    // ── Pesagem ──
    // produtoParaPesar: produto kg aguardando peso (clique no card kg ou re-pesagem)
    // cartItemEmReweigh: linha kg sendo re-pesada (null = nova pesagem)
    const [produtoParaPesar, setProdutoParaPesar] = useState<Produto | null>(null)
    const [cartItemEmReweigh, setCartItemEmReweigh] = useState<string | null>(null)

    // Helper case-insensitive pra checar se um produto é vendido por kg
    const isKg = (p: { unidade_medida?: string | null }) =>
        (p.unidade_medida ?? '').toLowerCase() === 'kg'

    // ── Comandas ──
    const [comandasLivres, setComandasLivres] = useState<Comanda[]>([])
    const [selectedComandaId, setSelectedComandaId] = useState<string | null>(null)
    const [semComanda, setSemComanda] = useState(false)
    const [loadingComandas, setLoadingComandas] = useState(false)
    const [comandaInput, setComandaInput] = useState('')

    // Seleciona uma comanda pelo número digitado (livre ou em uso). Bloqueada/inexistente avisa.
    function selecionarComandaPorNumero(v: string) {
        const num = parseInt(v, 10)
        if (!num || num < 1) { toast.error('Digite um número de comanda válido.'); return }
        const c = comandasLivres.find((x) => x.numero === num)
        if (!c) { toast.error(`Comanda ${num} indisponível (bloqueada ou inexistente).`); return }
        setSelectedComandaId(c.id); setSemComanda(false); setComandaInput('')
    }

    // Pega a primeira comanda livre (menor número) — pra entregar um cartão novo.
    function selecionarProximaComanda() {
        const livre = comandasLivres.filter((c) => c.status === 'livre').sort((a, b) => a.numero - b.numero)[0]
        if (!livre) { toast.error('Nenhuma comanda disponível. Libere uma ou adicione novas em Comandas.'); return }
        setSelectedComandaId(livre.id); setSemComanda(false); setComandaInput('')
    }

    const supabase = createClient()

    // Carrega comandas livres E em consumo — permite lançar novas rodadas na MESMA
    // comanda (a conta acumula no caixa). Bloqueadas ficam de fora.
    // ('consumo' é o status real de comanda ocupada — gerenciado por trigger no banco.)
    const fetchComandasLivres = useCallback(async () => {
        setLoadingComandas(true)
        const { data } = await supabase
            .from('comandas')
            .select('id, numero, status')
            .in('status', ['livre', 'consumo'])
            .order('numero')
        setComandasLivres((data ?? []) as Comanda[])
        setLoadingComandas(false)
    }, [supabase])

    useEffect(() => {
        if (tipoPedido === 'local') {
            fetchComandasLivres()
        }
    }, [tipoPedido, fetchComandasLivres])

    // ── Gerenciamento do Carrinho ──
    //
    // Itens "un" fundem por produto_id (clicar de novo incrementa quantidade).
    // Itens "kg" abrem ModalPesagem; cada pesagem gera uma linha nova com
    // cart_item_id proprio, mesmo se for o mesmo produto.
    const handleAddProduto = useCallback((produto: Produto) => {
        if (isKg(produto)) {
            setProdutoParaPesar(produto)
            setCartItemEmReweigh(null)
            return
        }
        setCarrinho((prev) => {
            const existente = prev.find(
                (i) => i.produto_id === produto.id && (i.unidade_medida ?? '').toLowerCase() !== 'kg'
            )
            if (existente) {
                return prev.map((i) =>
                    i.cart_item_id === existente.cart_item_id
                        ? { ...i, quantidade: i.quantidade + 1 }
                        : i
                )
            }
            return [
                ...prev,
                {
                    cart_item_id: novoCartItemId(),
                    produto_id: produto.id,
                    nome: produto.nome,
                    preco: Number(produto.preco),
                    quantidade: 1,
                    unidade_medida: produto.unidade_medida || 'un',
                },
            ]
        })
    }, [])

    // Botao + no carrinho. So funciona pra itens "un" — itens "kg" usam o modal.
    const handleAddById = useCallback((cart_item_id: string) => {
        setCarrinho((prev) =>
            prev.map((i) =>
                i.cart_item_id === cart_item_id && (i.unidade_medida ?? '').toLowerCase() !== 'kg'
                    ? { ...i, quantidade: i.quantidade + 1 }
                    : i
            )
        )
    }, [])

    // Botao -. Itens "un" decrementam; itens "kg" sao removidos por inteiro
    // (a logica de ajuste fino fica no modal de re-pesagem).
    const handleRemoveById = useCallback((cart_item_id: string) => {
        setCarrinho((prev) => {
            const item = prev.find((i) => i.cart_item_id === cart_item_id)
            if (!item) return prev
            const itemEhKg = (item.unidade_medida ?? '').toLowerCase() === 'kg'
            if (itemEhKg || item.quantidade <= 1) {
                return prev.filter((i) => i.cart_item_id !== cart_item_id)
            }
            return prev.map((i) =>
                i.cart_item_id === cart_item_id
                    ? { ...i, quantidade: i.quantidade - 1 }
                    : i
            )
        })
    }, [])

    // Re-pesagem: abre modal preenchido com o peso atual do item kg
    const handleRePesar = useCallback((cart_item_id: string) => {
        const item = carrinho.find((i) => i.cart_item_id === cart_item_id)
        if (!item || (item.unidade_medida ?? '').toLowerCase() !== 'kg') return
        const produto = produtos.find((p) => p.id === item.produto_id)
        if (!produto) return
        setProdutoParaPesar(produto)
        setCartItemEmReweigh(cart_item_id)
    }, [carrinho, produtos])

    // Callback do ModalPesagem: produto + peso em gramas → linha no carrinho.
    const handleConfirmarPesagem = useCallback((produtoConfirmado: Produto, pesoGramas: number) => {
        if (pesoGramas <= 0) {
            setProdutoParaPesar(null)
            setCartItemEmReweigh(null)
            return
        }
        const pesoKg = pesoGramas / 1000
        const precoPorKg = Number(produtoConfirmado.preco)

        setCarrinho((prev) => {
            // Re-pesagem: atualiza linha existente
            if (cartItemEmReweigh) {
                return prev.map((i) =>
                    i.cart_item_id === cartItemEmReweigh
                        ? { ...i, quantidade: pesoKg, peso_gramas: pesoGramas }
                        : i
                )
            }
            // Nova pesagem: linha independente, mesmo se o produto se repetir
            return [
                ...prev,
                {
                    cart_item_id: novoCartItemId(),
                    produto_id: produtoConfirmado.id,
                    nome: produtoConfirmado.nome,
                    preco: precoPorKg,
                    quantidade: pesoKg,
                    unidade_medida: 'kg',
                    peso_gramas: pesoGramas,
                },
            ]
        })
        setProdutoParaPesar(null)
        setCartItemEmReweigh(null)
    }, [cartItemEmReweigh])

    const handleCancelarPesagem = useCallback(() => {
        setProdutoParaPesar(null)
        setCartItemEmReweigh(null)
    }, [])

    // ── Submissão ──
    async function handleSubmit() {
        if (carrinho.length === 0) {
            toast.error('Adicione pelo menos um item ao pedido.')
            return
        }

        const total = carrinho.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
        const mesa = tipoPedido === 'local' && numeroMesa ? parseInt(numeroMesa, 10) : null

        setIsSubmitting(true)

        const { data, error } = await supabase.rpc('create_pedido_completo', {
            p_cliente_id: vendaAvulsa ? null : (cliente?.id ?? null),
            p_numero_mesa: mesa,
            p_vendedor_id: vendedorId,
            p_total: total,
            p_tipo_pedido: tipoPedido,
            p_comanda_id: selectedComandaId,
            p_destino_cozinha: destino === 'cozinha',
            p_destino_cafeteria: destino === 'cafeteria',
            p_observacoes: observacoes.trim() || null,
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
        const destinoLabel =
            destino === 'cozinha' ? 'enviado para a cozinha'
                : destino === 'cafeteria' ? 'enviado para a cafeteria'
                    : 'enviado direto para o caixa'
        toast.success(`Pedido ${tipoLabel} ${destinoLabel}!`, {
            description: `Pedido #${(data as any)?.pedido_id?.slice(0, 8).toUpperCase()} criado com sucesso.`,
        })

        // Reset completo para próximo atendimento
        setCliente(null)
        setVendaAvulsa(false)
        setNumeroMesa('')
        setObservacoes('')
        setSelectedComandaId(null)
        setSemComanda(false)
        setCarrinho([])
        setDestino('cozinha')
        setProdutoParaPesar(null)
        setCartItemEmReweigh(null)
        fetchComandasLivres()
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
                            onClick={() => { setTipoPedido('delivery'); setNumeroMesa(''); setSelectedComandaId(null); setSemComanda(false) }}
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

                {/* Seção 1: Cliente — 3 cards de modo (Balcão / Venda Avulsa / Buscar CPF) */}
                <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-gray-700 mb-3">1. Identificar Cliente</p>

                    <div className="flex flex-wrap gap-3 mb-3">
                        {/* Card 1: Balcão */}
                        <button
                            type="button"
                            onClick={() => { setModoCliente('balcao'); setCliente(null); setVendaAvulsa(false) }}
                            className={`w-[120px] h-[100px] rounded-xl border-2 p-3 bg-slate-100 flex flex-col items-center justify-center gap-1.5 transition-all duration-200 touch-manipulation active:scale-95 ${
                                modoCliente === 'balcao'
                                    ? 'border-primary shadow-md'
                                    : 'border-transparent opacity-60 hover:opacity-100'
                            }`}
                        >
                            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                                <User className="w-5 h-5 text-slate-600" />
                            </div>
                            <div className="text-center leading-tight">
                                <p className="text-[13px] font-bold text-slate-700">Balcão</p>
                                <p className="text-[10px] text-slate-500">sem identificação</p>
                            </div>
                        </button>

                        {/* Card 2: Venda Avulsa */}
                        <button
                            type="button"
                            onClick={() => { setModoCliente('avulsa'); setVendaAvulsa(true); setCliente(null) }}
                            className={`w-[120px] h-[100px] rounded-xl border-2 p-3 bg-amber-50 flex flex-col items-center justify-center gap-1.5 transition-all duration-200 touch-manipulation active:scale-95 ${
                                modoCliente === 'avulsa'
                                    ? 'border-primary shadow-md'
                                    : 'border-transparent opacity-60 hover:opacity-100'
                            }`}
                        >
                            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                                <Zap className="w-5 h-5 text-amber-600" />
                            </div>
                            <div className="text-center leading-tight">
                                <p className="text-[13px] font-bold text-amber-800">Venda Avulsa</p>
                                <p className="text-[10px] text-amber-700">sem cadastro</p>
                            </div>
                        </button>

                        {/* Card 3: Buscar CPF */}
                        <button
                            type="button"
                            onClick={() => { setModoCliente('cpf'); setVendaAvulsa(false) }}
                            className={`w-[120px] h-[100px] rounded-xl border-2 p-3 bg-white flex flex-col items-center justify-center gap-1.5 transition-all duration-200 touch-manipulation active:scale-95 ${
                                modoCliente === 'cpf'
                                    ? 'border-primary shadow-md'
                                    : 'border-gray-200 opacity-60 hover:opacity-100'
                            }`}
                        >
                            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                                <Search className="w-5 h-5 text-primary" />
                            </div>
                            <div className="text-center leading-tight">
                                <p className="text-[13px] font-bold text-primary">Buscar CPF</p>
                                <p className="text-[10px] text-slate-500">cliente cadastrado</p>
                            </div>
                        </button>

                        {/* Card 4: Buscar Nome */}
                        <button
                            type="button"
                            onClick={() => { setModoCliente('nome'); setVendaAvulsa(false) }}
                            className={`w-[120px] h-[100px] rounded-xl border-2 p-3 bg-white flex flex-col items-center justify-center gap-1.5 transition-all duration-200 touch-manipulation active:scale-95 ${
                                modoCliente === 'nome'
                                    ? 'border-primary shadow-md'
                                    : 'border-gray-200 opacity-60 hover:opacity-100'
                            }`}
                        >
                            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
                                <UserSearch className="w-5 h-5 text-primary" />
                            </div>
                            <div className="text-center leading-tight">
                                <p className="text-[13px] font-bold text-primary">Buscar Nome</p>
                                <p className="text-[10px] text-slate-500">cliente cadastrado</p>
                            </div>
                        </button>
                    </div>

                    {/* Conteúdo abaixo dos cards */}
                    {modoCliente === 'cpf' && (
                        <BuscaClienteCPF
                            onClienteSelect={setCliente}
                            clienteSelecionado={cliente}
                        />
                    )}
                    {modoCliente === 'nome' && (
                        <BuscaClienteNome
                            onClienteSelect={setCliente}
                            clienteSelecionado={cliente}
                        />
                    )}
                    {modoCliente === 'avulsa' && (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                            <UserX className="w-4 h-4 text-amber-700 shrink-0" />
                            <p className="text-sm text-amber-800 font-medium">Venda sem cadastro de cliente.</p>
                        </div>
                    )}
                </div>

                {/* Seção 2: Comanda (somente para pedidos locais) */}
                {tipoPedido === 'local' && (
                    <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-gray-500" />
                                Comanda
                            </p>
                            {selectedComandaId && (
                                <button
                                    type="button"
                                    onClick={() => { setSelectedComandaId(null); setSemComanda(false) }}
                                    className="text-xs text-red-500 font-semibold hover:underline flex items-center gap-1"
                                >
                                    <X className="w-3 h-3" /> Limpar
                                </button>
                            )}
                        </div>

                        {semComanda ? (
                            <div className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl border-2 border-dashed border-slate-400">
                                <div className="flex items-center gap-2">
                                    <Ban className="w-4 h-4 text-slate-500" />
                                    <span className="text-sm font-bold text-slate-700">Sem comanda (balcão)</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSemComanda(false)}
                                    className="text-xs text-primary font-semibold hover:underline"
                                >
                                    Selecionar comanda
                                </button>
                            </div>
                        ) : selectedComandaId ? (
                            <div className="flex items-center justify-center py-3 px-4 bg-emerald-50 rounded-xl border-2 border-emerald-300">
                                <span className="text-lg font-extrabold text-emerald-700">
                                    Comanda #{comandasLivres.find(c => c.id === selectedComandaId)?.numero ?? '?'}
                                </span>
                            </div>
                        ) : loadingComandas ? (
                            <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
                                Carregando comandas...
                            </div>
                        ) : (() => {
                            const emUso = comandasLivres.filter((c) => c.status === 'consumo').sort((a, b) => a.numero - b.numero)
                            const qtdLivres = comandasLivres.filter((c) => c.status === 'livre').length
                            return (
                                <div className="space-y-3">
                                    {/* Digitar o número da comanda (do cartão físico) */}
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                min={1}
                                                placeholder="Nº da comanda"
                                                value={comandaInput}
                                                onChange={(e) => setComandaInput(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); selecionarComandaPorNumero(comandaInput) } }}
                                                className="w-full h-12 pl-9 pr-3 rounded-xl border-2 border-blue-100 bg-white text-lg font-bold
                                                           text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-gray-300 placeholder:text-base placeholder:font-normal"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => selecionarComandaPorNumero(comandaInput)}
                                            disabled={!comandaInput}
                                            className="px-5 h-12 rounded-xl bg-primary text-white font-bold text-sm
                                                       hover:bg-primary/90 active:scale-95 transition-all touch-manipulation
                                                       disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            Selecionar
                                        </button>
                                    </div>

                                    {/* Próxima comanda disponível (entregar cartão novo) */}
                                    <button
                                        type="button"
                                        onClick={selecionarProximaComanda}
                                        className="w-full h-12 rounded-xl bg-emerald-50 border-2 border-emerald-300 text-emerald-700
                                                   font-bold text-sm flex items-center justify-center gap-2
                                                   hover:bg-emerald-100 hover:border-emerald-400 active:scale-[0.98] transition-all touch-manipulation"
                                    >
                                        <Zap className="w-4 h-4" />
                                        Próxima comanda disponível
                                        <span className="text-xs font-semibold opacity-70">({qtdLivres} livres)</span>
                                    </button>

                                    {/* Comandas em aberto — só as em uso, pra adicionar uma rodada */}
                                    {emUso.length > 0 && (
                                        <div>
                                            <p className="text-[11px] font-semibold text-amber-700/80 mb-1.5">
                                                Em aberto — clique pra adicionar na mesma conta
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {emUso.map((c) => (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        onClick={() => { setSelectedComandaId(c.id); setSemComanda(false) }}
                                                        className="min-w-[46px] h-11 px-2.5 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-700
                                                                   font-extrabold text-base hover:bg-amber-100 hover:border-amber-400 active:scale-95
                                                                   transition-all touch-manipulation flex items-center justify-center"
                                                    >
                                                        {c.numero}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Sem comanda (balcão) */}
                                    <button
                                        type="button"
                                        onClick={() => { setSemComanda(true); setSelectedComandaId(null) }}
                                        className="w-full h-12 rounded-xl bg-slate-50 border-2 border-dashed border-slate-300
                                                   text-slate-600 font-bold text-sm
                                                   hover:bg-slate-100 hover:border-slate-400 hover:shadow-sm
                                                   active:scale-[0.98] transition-all duration-200 touch-manipulation
                                                   flex items-center justify-center gap-2"
                                    >
                                        <Ban className="w-4 h-4" />
                                        Sem comanda (balcão)
                                    </button>
                                </div>
                            )
                        })()}
                    </div>
                )}

                {/* Seção 3: Mesa (somente para pedidos locais) */}
                {tipoPedido === 'local' && (
                    <div className="bg-sky-50 rounded-2xl border border-sky-100 border-l-[3px] border-l-primary p-4 shadow-sm">
                        <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                            <UtensilsCrossed className="w-4 h-4 text-primary" />
                            Número da Mesa
                        </p>
                        <input
                            type="number"
                            min={1}
                            max={99}
                            placeholder="— (opcional, ex: 5)"
                            value={numeroMesa}
                            onChange={(e) => setNumeroMesa(e.target.value)}
                            className="w-full h-14 px-4 rounded-xl border border-sky-200 bg-white text-center
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

                {/* Seção 3.5: Observações (opcional) — vai na Nota de Pedido */}
                <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-gray-700 mb-2">
                        Observações <span className="text-gray-400 font-normal">(opcional)</span>
                    </p>
                    <textarea
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        rows={2}
                        placeholder="Ex: sem cebola no bacon, café sem açúcar..."
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm resize-none
                                   focus:outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-gray-300"
                    />
                </div>

                {/* Seção 4: Catálogo */}
                <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm flex-1">
                    <p className="text-sm font-semibold text-gray-700 mb-3">3. Catálogo de Produtos</p>
                    <CatalogoProdutos
                        produtos={produtos}
                        onAddProduto={handleAddProduto}
                        hideHeader
                    />
                </div>
            </div>

            {/* ── Coluna Direita: Carrinho (fixo em tablet/desktop) ── */}
            <div className="w-full lg:w-80 xl:w-96 shrink-0 lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)]">
                <CarrinhoLateral
                    itens={carrinho}
                    onAdd={handleAddById}
                    onRemove={handleRemoveById}
                    onRePesar={handleRePesar}
                    onSubmit={handleSubmit}
                    isSubmitting={isSubmitting}
                    destino={destino}
                    onDestinoChange={setDestino}
                />
                {/* ── Modal de Pesagem ── */}
                {produtoParaPesar && (
                    <ModalPesagem
                        produto={produtoParaPesar}
                        onConfirmar={handleConfirmarPesagem}
                        onCancelar={handleCancelarPesagem}
                        pesoInicialGramas={
                            cartItemEmReweigh
                                ? carrinho.find((i) => i.cart_item_id === cartItemEmReweigh)?.peso_gramas
                                : undefined
                        }
                    />
                )}

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
                            {carrinho.reduce((acc, i) => acc + ((i.unidade_medida ?? '').toLowerCase() === 'kg' ? 1 : i.quantidade), 0)}
                        </span>
                    </button>
                )}
            </div>
        </div>
    )
}
