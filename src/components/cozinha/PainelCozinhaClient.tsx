'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import { Clock, ChefHat, Flame, CheckCircle2, Bell, HelpCircle, X, Keyboard, FlaskConical, Loader2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { getAgoraUTC } from '@/lib/timezone'

// ── Types ──────────────────────────────────────────────────────────────────
interface ItemPedidoCozinha {
    quantidade: number
    produto_nome: string
    produto_id?: string
}

export interface PedidoCozinha {
    id: string
    numero_mesa: number | null
    total: number
    status: 'pendente' | 'preparando' | 'pronto'
    tipo_pedido?: 'local' | 'delivery'
    created_at: string
    itens: ItemPedidoCozinha[]
}

type KanbanColumn = 'pendente' | 'preparando' | 'pronto'

interface PainelCozinhaClientProps {
    pedidosIniciais: PedidoCozinha[]
}

interface IngredienteReceita {
    produto_id: string
    quantidade: number
    unidade: string
    produto_nome?: string
}

// ── Sound via Web Audio API ─────────────────────────────────────────────────
function playBeep() {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12)
        gain.gain.setValueAtTime(0.4, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)

        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.4)
    } catch {
        // Safari / contexto sem interação do usuário — silencia sem erro
    }
}

// ── Timer Hook — atualiza a cada 30s ────────────────────────────────────────
function useTickEvery30s() {
    const [tick, setTick] = useState(0)
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 30_000)
        return () => clearInterval(id)
    }, [])
    return tick
}

// ── Hook de Atalhos de Teclado ──────────────────────────────────────────────
function useKeyPress(callback: (key: string) => void) {
    useEffect(() => {
        function handler(e: KeyboardEvent) {
            // Ignora se o foco está em um input, textarea ou select
            const tag = (e.target as HTMLElement).tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

            callback(e.key)
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [callback])
}

// ── Modal de Ficha Técnica ──────────────────────────────────────────────────
function ModalFichaTecnica({
    produtoNome,
    produtoId,
    onClose,
}: {
    produtoNome: string
    produtoId?: string
    onClose: () => void
}) {
    const [ingredientes, setIngredientes] = useState<IngredienteReceita[]>([])
    const [loading, setLoading] = useState(true)
    const [naoEncontrada, setNaoEncontrada] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        async function buscar() {
            setLoading(true)
            setNaoEncontrada(false)

            // Tenta encontrar receita pelo produto_id ou pelo nome do produto
            let query = supabase.from('receitas').select('id, nome, ingredientes')

            if (produtoId) {
                query = query.eq('produto_id', produtoId)
            }

            const { data } = await query.limit(10)

            // Se buscou por produto_id e achou, usa. Senão, tenta por nome
            let receita = data && data.length > 0 ? data[0] : null

            if (!receita && !produtoId) {
                // Fallback: busca por nome similar
                const { data: porNome } = await supabase
                    .from('receitas')
                    .select('id, nome, ingredientes')
                    .ilike('nome', `%${produtoNome}%`)
                    .limit(1)

                receita = porNome && porNome.length > 0 ? porNome[0] : null
            }

            if (!receita) {
                setNaoEncontrada(true)
                setLoading(false)
                return
            }

            // Resolve nomes dos ingredientes
            const ings = (receita.ingredientes as any[]) ?? []
            const produtoIds = ings.map((i: any) => i.produto_id).filter(Boolean)

            if (produtoIds.length > 0) {
                const { data: produtos } = await supabase
                    .from('produtos')
                    .select('id, nome')
                    .in('id', produtoIds)

                const prodMap: Record<string, string> = {}
                for (const p of produtos ?? []) {
                    prodMap[p.id] = p.nome
                }

                setIngredientes(
                    ings.map((i: any) => ({
                        ...i,
                        produto_nome: prodMap[i.produto_id] ?? i.produto_id,
                    }))
                )
            } else {
                setIngredientes(ings)
            }

            setLoading(false)
        }

        buscar()
    }, [produtoId, produtoNome, supabase])

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-blue-50">
                    <div className="flex items-center gap-2">
                        <FlaskConical className="w-5 h-5 text-blue-600" />
                        <div>
                            <h3 className="font-extrabold text-gray-800 text-sm">Ficha Técnica</h3>
                            <p className="text-xs text-blue-700 font-semibold">{produtoNome}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-blue-100 rounded-xl transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5">
                    {loading ? (
                        <div className="flex flex-col items-center py-8 gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                            <p className="text-xs text-gray-400">Buscando ficha técnica...</p>
                        </div>
                    ) : naoEncontrada ? (
                        <div className="flex flex-col items-center py-8 gap-3 text-gray-400">
                            <FlaskConical className="w-10 h-10 opacity-20" />
                            <p className="text-sm font-medium">Ficha técnica não encontrada</p>
                            <p className="text-xs">Este produto ainda não possui receita cadastrada.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
                                Ingredientes por lote
                            </p>
                            {ingredientes.map((ing, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100"
                                >
                                    <span className="text-sm font-medium text-gray-700">
                                        {ing.produto_nome ?? ing.produto_id}
                                    </span>
                                    <span className="text-sm font-bold text-blue-700">
                                        {ing.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {ing.unidade}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Modal de Atalhos (Hotkeys Help) ──────────────────────────────────────────
function ModalAtalhos({ onClose }: { onClose: () => void }) {
    const atalhos = [
        { tecla: 'P', alt: '1', descricao: 'Iniciar Preparo do pedido pendente mais antigo' },
        { tecla: 'D', alt: '2', descricao: 'Marcar como Pronto o pedido em preparo mais antigo' },
        { tecla: '?', alt: '', descricao: 'Abrir/fechar esta lista de atalhos' },
    ]

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Keyboard className="w-5 h-5 text-blue-600" />
                        <h3 className="font-extrabold text-gray-800 text-sm">Atalhos de Teclado</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    {atalhos.map((a, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                            <div className="flex items-center gap-1.5 shrink-0">
                                <kbd className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-700 shadow-sm">
                                    {a.tecla}
                                </kbd>
                                {a.alt && (
                                    <>
                                        <span className="text-xs text-gray-400">ou</span>
                                        <kbd className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono font-bold text-gray-700 shadow-sm">
                                            {a.alt}
                                        </kbd>
                                    </>
                                )}
                            </div>
                            <p className="text-sm text-gray-600 pt-1.5">{a.descricao}</p>
                        </div>
                    ))}
                </div>

                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                    <p className="text-xs text-gray-400 text-center">
                        Os atalhos só funcionam quando nenhum campo de texto está em foco.
                    </p>
                </div>
            </div>
        </div>
    )
}

// ── Card de Pedido ───────────────────────────────────────────────────────────
function PedidoCard({
    pedido,
    onAvancar,
    onClickProduto,
}: {
    pedido: PedidoCozinha
    onAvancar: (id: string, proximoStatus: KanbanColumn) => void
    onClickProduto: (nome: string, produtoId?: string) => void
}) {
    useTickEvery30s()
    const tempo = formatDistanceToNow(new Date(pedido.created_at), {
        locale: ptBR,
        addSuffix: false,
    })

    const proximoStatus: KanbanColumn | null =
        pedido.status === 'pendente' ? 'preparando' :
            pedido.status === 'preparando' ? 'pronto' : null

    const btnLabel =
        pedido.status === 'pendente' ? 'Iniciar Preparo' :
            pedido.status === 'preparando' ? 'Marcar como Pronto' : null

    const btnColor =
        pedido.status === 'pendente' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-400/30' :
            pedido.status === 'preparando' ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-400/30' : ''

    return (
        <div className={`bg-white rounded-2xl shadow-md border overflow-hidden
                        active:scale-[0.99] transition-transform
                        ${pedido.tipo_pedido === 'delivery' ? 'border-blue-200 ring-2 ring-blue-100' : 'border-gray-100'}`}>
            {/* Header do card */}
            <div className={`px-4 py-3 flex items-center justify-between
                ${pedido.status === 'pendente' ? 'bg-red-50 border-b border-red-100' :
                    pedido.status === 'preparando' ? 'bg-blue-50 border-b border-blue-100' :
                        'bg-emerald-50 border-b border-emerald-100'}`}>
                <div className="flex items-center gap-2">
                    <span className="text-2xl font-extrabold text-gray-800">
                        {pedido.numero_mesa ? `Mesa ${pedido.numero_mesa}` : 'Balcão'}
                    </span>
                    {(pedido.tipo_pedido === 'delivery') && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-wider">
                            <Truck className="w-3 h-3" />
                            Delivery
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 text-gray-500 text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{tempo}</span>
                </div>
            </div>

            {/* Itens — clicáveis para ver ficha técnica */}
            <ul className="px-4 py-3 space-y-1.5">
                {pedido.itens.map((item, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center
                                         text-xs font-bold text-gray-600 shrink-0">
                            {item.quantidade}
                        </span>
                        <button
                            onClick={() => onClickProduto(item.produto_nome, item.produto_id)}
                            className="font-medium leading-tight text-left hover:text-blue-700 hover:underline
                                       underline-offset-2 decoration-blue-300 transition-colors cursor-pointer"
                            title="Ver ficha técnica"
                        >
                            {item.produto_nome}
                        </button>
                    </li>
                ))}
                {pedido.itens.length === 0 && (
                    <li className="text-xs text-gray-400 italic">Sem itens registrados</li>
                )}
            </ul>

            {/* Botão de ação */}
            {proximoStatus && btnLabel && (
                <div className="px-4 pb-4">
                    <button
                        onClick={() => onAvancar(pedido.id, proximoStatus)}
                        className={`w-full h-11 rounded-xl text-white text-sm font-bold transition-all
                                    active:scale-95 touch-manipulation shadow-lg ${btnColor}`}
                    >
                        {btnLabel}
                    </button>
                </div>
            )}
        </div>
    )
}

// ── Coluna do Kanban ─────────────────────────────────────────────────────────
const COLUNA_CONFIG = {
    pendente: {
        label: 'Pendentes',
        icon: Bell,
        header: 'bg-red-500',
        ring: 'ring-red-200',
        pulse: true,
    },
    preparando: {
        label: 'Em Preparo',
        icon: Flame,
        header: 'bg-blue-500',
        ring: 'ring-blue-200',
        pulse: false,
    },
    pronto: {
        label: 'Prontos',
        icon: CheckCircle2,
        header: 'bg-emerald-500',
        ring: 'ring-emerald-200',
        pulse: false,
    },
} as const

function Coluna({
    status,
    pedidos,
    onAvancar,
    onClickProduto,
}: {
    status: KanbanColumn
    pedidos: PedidoCozinha[]
    onAvancar: (id: string, proximoStatus: KanbanColumn) => void
    onClickProduto: (nome: string, produtoId?: string) => void
}) {
    const cfg = COLUNA_CONFIG[status]
    const Icon = cfg.icon

    return (
        <div className={`flex flex-col min-h-0 flex-1 rounded-2xl ring-2 ${cfg.ring} overflow-hidden`}>
            {/* Cabeçalho da coluna */}
            <div className={`${cfg.header} flex items-center justify-between px-4 py-3 shrink-0`}>
                <div className="flex items-center gap-2 text-white font-bold text-base">
                    <Icon className="w-5 h-5" />
                    {cfg.label}
                </div>
                <span className="bg-white/20 text-white text-sm font-bold px-2.5 py-0.5 rounded-full">
                    {pedidos.length}
                </span>
            </div>

            {/* Lista de cards */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/80">
                {pedidos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
                        <ChefHat className="w-8 h-8 opacity-30" />
                        <p className="text-xs text-center">Nenhum pedido aqui</p>
                    </div>
                ) : (
                    pedidos.map((pedido) => (
                        <PedidoCard
                            key={pedido.id}
                            pedido={pedido}
                            onAvancar={onAvancar}
                            onClickProduto={onClickProduto}
                        />
                    ))
                )}
            </div>
        </div>
    )
}

// ── Componente Principal ─────────────────────────────────────────────────────
export default function PainelCozinhaClient({ pedidosIniciais }: PainelCozinhaClientProps) {
    const [pedidos, setPedidos] = useState<PedidoCozinha[]>(pedidosIniciais)
    const supabase = createClient()
    const audioCtxUnlocked = useRef(false)

    // Modais
    const [fichaAberta, setFichaAberta] = useState<{ nome: string; produtoId?: string } | null>(null)
    const [atalhosAberto, setAtalhosAberto] = useState(false)

    // Unlock AudioContext no primeiro toque
    useEffect(() => {
        function unlock() {
            audioCtxUnlocked.current = true
            document.removeEventListener('click', unlock)
        }
        document.addEventListener('click', unlock)
        return () => document.removeEventListener('click', unlock)
    }, [])

    // ── Ação: avançar status ─────────────────────────────────────────────────
    const handleAvancar = useCallback(async (id: string, proximoStatus: KanbanColumn) => {
        setPedidos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: proximoStatus } : p))
        )
        const { error } = await supabase
            .from('pedidos')
            .update({ status: proximoStatus, updated_at: getAgoraUTC() })
            .eq('id', id)

        if (error) {
            setPedidos((prev) =>
                prev.map((p) =>
                    p.id === id
                        ? { ...p, status: proximoStatus === 'preparando' ? 'pendente' : 'preparando' }
                        : p
                )
            )
            toast.error('Erro ao atualizar pedido')
        }
    }, [supabase])

    // ── Atalhos de teclado ───────────────────────────────────────────────────
    const handleKeyPress = useCallback((key: string) => {
        // Ignora se algum modal está aberto
        if (fichaAberta || atalhosAberto) {
            if (key === 'Escape') {
                setFichaAberta(null)
                setAtalhosAberto(false)
            }
            return
        }

        const pendentes = pedidos
            .filter((p) => p.status === 'pendente')
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        const preparando = pedidos
            .filter((p) => p.status === 'preparando')
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

        const lowerKey = key.toLowerCase()

        // P ou 1 → Iniciar Preparo do pendente mais antigo
        if (lowerKey === 'p' || key === '1') {
            if (pendentes.length > 0) {
                handleAvancar(pendentes[0].id, 'preparando')
                toast.info(`⌨️ Iniciando preparo — Mesa ${pendentes[0].numero_mesa ?? 'Balcão'}`)
            } else {
                toast.info('Nenhum pedido pendente')
            }
            return
        }

        // D ou 2 → Marcar como Pronto o em preparo mais antigo
        if (lowerKey === 'd' || key === '2') {
            if (preparando.length > 0) {
                handleAvancar(preparando[0].id, 'pronto')
                toast.success(`⌨️ Pronto! — Mesa ${preparando[0].numero_mesa ?? 'Balcão'}`)
            } else {
                toast.info('Nenhum pedido em preparo')
            }
            return
        }

        // ? → Abrir modal de atalhos
        if (key === '?') {
            setAtalhosAberto(true)
        }
    }, [pedidos, handleAvancar, fichaAberta, atalhosAberto])

    useKeyPress(handleKeyPress)

    // ── Handler para clique no produto ───────────────────────────────────────
    const handleClickProduto = useCallback((nome: string, produtoId?: string) => {
        setFichaAberta({ nome, produtoId })
    }, [])

    // ── Realtime Subscription ────────────────────────────────────────────────
    useEffect(() => {
        const channel = supabase
            .channel('cozinha_realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'pedidos' },
                async (payload) => {
                    const novo = payload.new as any

                    if (novo.status === 'entregue' || novo.status === 'cancelado') return

                    const { data: itens } = await supabase
                        .from('itens_pedido')
                        .select('quantidade, produto_id, produtos(nome)')
                        .eq('pedido_id', novo.id)

                    const itensMapped: ItemPedidoCozinha[] = (itens ?? []).map((i: any) => ({
                        quantidade: i.quantidade,
                        produto_nome: i.produtos?.nome ?? 'Produto',
                        produto_id: i.produto_id,
                    }))

                    const pedidoNovo: PedidoCozinha = {
                        id: novo.id,
                        numero_mesa: novo.numero_mesa,
                        total: novo.total,
                        status: novo.status,
                        tipo_pedido: novo.tipo_pedido || 'local',
                        created_at: novo.created_at,
                        itens: itensMapped,
                    }

                    setPedidos((prev) => [pedidoNovo, ...prev])

                    if (audioCtxUnlocked.current) playBeep()
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'pedidos' },
                (payload) => {
                    const atualizado = payload.new as any

                    if (atualizado.status === 'entregue' || atualizado.status === 'cancelado') {
                        setPedidos((prev) => prev.filter((p) => p.id !== atualizado.id))
                        return
                    }

                    setPedidos((prev) =>
                        prev.map((p) =>
                            p.id === atualizado.id ? { ...p, status: atualizado.status } : p
                        )
                    )
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [supabase])

    // ── Filtra por coluna ────────────────────────────────────────────────────
    const pendentes = pedidos.filter((p) => p.status === 'pendente')
    const preparandoList = pedidos.filter((p) => p.status === 'preparando')
    const prontos = pedidos.filter((p) => p.status === 'pronto')

    return (
        <>
            <div className="flex gap-4 h-[calc(100vh-8rem)] min-h-0">
                <Coluna status="pendente" pedidos={pendentes} onAvancar={handleAvancar} onClickProduto={handleClickProduto} />
                <Coluna status="preparando" pedidos={preparandoList} onAvancar={handleAvancar} onClickProduto={handleClickProduto} />
                <Coluna status="pronto" pedidos={prontos} onAvancar={handleAvancar} onClickProduto={handleClickProduto} />
            </div>

            {/* Modal de Ficha Técnica */}
            {fichaAberta && (
                <ModalFichaTecnica
                    produtoNome={fichaAberta.nome}
                    produtoId={fichaAberta.produtoId}
                    onClose={() => setFichaAberta(null)}
                />
            )}

            {/* Modal de Atalhos */}
            {atalhosAberto && (
                <ModalAtalhos onClose={() => setAtalhosAberto(false)} />
            )}
        </>
    )
}
