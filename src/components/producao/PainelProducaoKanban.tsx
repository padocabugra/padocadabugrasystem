'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import {
    Clock, ChefHat, Coffee, Flame, CheckCircle2, Bell, X, Keyboard,
    FlaskConical, Loader2, Truck, Plus, Search, Hash, Minus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { getAgoraUTC } from '@/lib/timezone'

// ── Types ──────────────────────────────────────────────────────────────────
interface ItemPedidoProducao {
    quantidade: number
    produto_nome: string
    produto_id?: string
}

export interface PedidoProducao {
    id: string
    numero_mesa: number | null
    total: number
    status: 'pendente' | 'preparando' | 'pronto'
    tipo_pedido?: 'local' | 'delivery'
    created_at: string
    itens: ItemPedidoProducao[]
}

type KanbanColumn = 'pendente' | 'preparando' | 'pronto'

/** Produto enxuto para o quick-add (adicionar 1 item direto no painel). */
export interface ProdutoQuickAdd {
    id: string
    nome: string
    preco: number
    unidade_medida?: string | null
    categoria?: string | null
}

export type VarianteProducao = 'cozinha' | 'cafeteria'

interface IngredienteReceita {
    produto_id: string
    quantidade: number
    unidade: string
    produto_nome?: string
}

// ── Configuração por variante (tema + roteamento) ────────────────────────────
//
// A Cozinha mantém EXATAMENTE as cores originais (zero mudança visual).
// A Cafeteria usa uma paleta quente (âmbar/laranja) + iconografia de café,
// pra não confundir os dois painéis num relance.
interface VarianteConfig {
    canal: string
    campoDestino: 'destino_cozinha' | 'destino_cafeteria'
    campoRetirado: 'retirado_cozinha' | 'retirado_cafeteria'
    /** Aceita um pedido recém-inserido (realtime) nesta fila? */
    aceitaNovo: (p: { destino_cozinha?: boolean; destino_cafeteria?: boolean }) => boolean
    emptyIcon: LucideIcon
    colunas: Record<KanbanColumn, { label: string; icon: LucideIcon; header: string; ring: string; pulse: boolean }>
    cardHeader: Record<KanbanColumn, string>
    btnPreparar: string
    btnPronto: string
    /** classes de hover do nome do produto (link p/ ficha técnica) */
    produtoHover: string
}

const VARIANTES: Record<VarianteProducao, VarianteConfig> = {
    cozinha: {
        canal: 'cozinha_realtime',
        campoDestino: 'destino_cozinha',
        campoRetirado: 'retirado_cozinha',
        aceitaNovo: (p) => p.destino_cozinha !== false,
        emptyIcon: ChefHat,
        colunas: {
            pendente: { label: 'Pendentes', icon: Bell, header: 'bg-red-500', ring: 'ring-red-200', pulse: true },
            preparando: { label: 'Em Preparo', icon: Flame, header: 'bg-blue-500', ring: 'ring-blue-200', pulse: false },
            pronto: { label: 'Prontos', icon: CheckCircle2, header: 'bg-emerald-500', ring: 'ring-emerald-200', pulse: false },
        },
        cardHeader: {
            pendente: 'bg-red-50 border-b border-red-100',
            preparando: 'bg-blue-50 border-b border-blue-100',
            pronto: 'bg-emerald-50 border-b border-emerald-100',
        },
        btnPreparar: 'bg-blue-600 hover:bg-blue-700 shadow-blue-400/30',
        btnPronto: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-400/30',
        produtoHover: 'hover:text-blue-700 decoration-blue-300',
    },
    cafeteria: {
        canal: 'cafeteria_realtime',
        campoDestino: 'destino_cafeteria',
        campoRetirado: 'retirado_cafeteria',
        aceitaNovo: (p) => p.destino_cafeteria === true,
        emptyIcon: Coffee,
        colunas: {
            pendente: { label: 'Pendentes', icon: Bell, header: 'bg-amber-500', ring: 'ring-amber-200', pulse: true },
            preparando: { label: 'Em Preparo', icon: Coffee, header: 'bg-orange-600', ring: 'ring-orange-200', pulse: false },
            pronto: { label: 'Prontos', icon: CheckCircle2, header: 'bg-emerald-600', ring: 'ring-emerald-200', pulse: false },
        },
        cardHeader: {
            pendente: 'bg-amber-50 border-b border-amber-100',
            preparando: 'bg-orange-50 border-b border-orange-100',
            pronto: 'bg-emerald-50 border-b border-emerald-100',
        },
        btnPreparar: 'bg-orange-600 hover:bg-orange-700 shadow-orange-400/30',
        btnPronto: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-400/30',
        produtoHover: 'hover:text-orange-700 decoration-orange-300',
    },
}

interface PainelProducaoKanbanProps {
    pedidosIniciais: PedidoProducao[]
    variante: VarianteProducao
    /** Quando presente, habilita o "+ Adicionar item" no painel (usado na Cafeteria). */
    quickAdd?: { vendedorId: string; produtos: ProdutoQuickAdd[] }
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
    const [, setTick] = useState(0)
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 30_000)
        return () => clearInterval(id)
    }, [])
}

// ── Hook de Atalhos de Teclado ──────────────────────────────────────────────
function useKeyPress(callback: (key: string) => void) {
    useEffect(() => {
        function handler(e: KeyboardEvent) {
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

            let query = supabase.from('receitas').select('id, nome, ingredientes')
            if (produtoId) {
                query = query.eq('produto_id', produtoId)
            }
            const { data } = await query.limit(10)
            let receita = data && data.length > 0 ? data[0] : null

            if (!receita && !produtoId) {
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

// ── Modal Quick-Add: adiciona 1 item à fila (Cafeteria) ──────────────────────
//
// Pedido enxuto do balcão do café: escolhe 1 produto, define quantidade e o
// número da comanda/mesa/pessoa (opcional). Cria um pedido com destino_cafeteria
// — entra na coluna "Pendentes" e segue o mesmo fluxo (e cobrança no Caixa).
function ModalQuickAdd({
    produtos,
    vendedorId,
    onClose,
    onCriado,
}: {
    produtos: ProdutoQuickAdd[]
    vendedorId: string
    onClose: () => void
    onCriado: (pedido: PedidoProducao) => void
}) {
    const supabase = createClient()
    const [busca, setBusca] = useState('')
    const [produtoSel, setProdutoSel] = useState<ProdutoQuickAdd | null>(null)
    const [qtd, setQtd] = useState(1)
    const [identificador, setIdentificador] = useState('')
    const [enviando, setEnviando] = useState(false)

    const formatBRL = (v: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    const termo = busca.trim().toLowerCase()
    const filtrados = termo
        ? produtos.filter((p) => p.nome.toLowerCase().includes(termo)).slice(0, 30)
        : produtos.slice(0, 30)

    async function handleSubmit() {
        if (!produtoSel) {
            toast.error('Selecione um produto.')
            return
        }
        const numeroMesa = identificador.trim() ? parseInt(identificador.trim(), 10) : null
        if (identificador.trim() && (!numeroMesa || numeroMesa < 1)) {
            toast.error('Número da comanda/mesa inválido.')
            return
        }
        const quantidade = Math.max(1, qtd)
        const total = produtoSel.preco * quantidade

        setEnviando(true)
        const { data, error } = await supabase.rpc('create_pedido_completo', {
            p_cliente_id: null,
            p_numero_mesa: numeroMesa,
            p_vendedor_id: vendedorId,
            p_total: total,
            p_tipo_pedido: 'local',
            p_comanda_id: null,
            p_destino_cozinha: false,
            p_destino_cafeteria: true,
            p_itens: [
                {
                    produto_id: produtoSel.id,
                    quantidade,
                    preco_unitario: produtoSel.preco,
                },
            ],
        })
        setEnviando(false)

        if (error) {
            toast.error('Erro ao adicionar item', { description: error.message })
            return
        }

        // Inserção otimista: mostra o card na hora (o eco do realtime é deduplicado por id).
        const pedidoId = (data as any)?.pedido_id
        if (pedidoId) {
            onCriado({
                id: pedidoId,
                numero_mesa: numeroMesa,
                total,
                status: 'pendente',
                tipo_pedido: 'local',
                created_at: new Date().toISOString(),
                itens: [{ quantidade, produto_nome: produtoSel.nome, produto_id: produtoSel.id }],
            })
        }
        toast.success(
            `${quantidade}× ${produtoSel.nome} — ${numeroMesa ? `Mesa/Comanda ${numeroMesa}` : 'Balcão'}`
        )
        onClose()
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100 bg-amber-50 shrink-0">
                    <div className="flex items-center gap-2">
                        <Coffee className="w-5 h-5 text-amber-600" />
                        <h3 className="font-extrabold text-gray-800 text-sm">Adicionar item — Cafeteria</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-amber-100 rounded-xl transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Identificador (comanda/mesa/pessoa) */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                            Comanda / Mesa / Pessoa
                        </label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                placeholder="Nº (opcional — vazio = Balcão)"
                                value={identificador}
                                onChange={(e) => setIdentificador(e.target.value)}
                                className="w-full h-12 pl-9 pr-3 rounded-xl border-2 border-amber-100 bg-white text-lg font-bold
                                           text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-300 placeholder:text-gray-300 placeholder:text-sm placeholder:font-normal"
                            />
                        </div>
                    </div>

                    {/* Busca de produto */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                            Item
                        </label>
                        <div className="relative mb-2">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar produto..."
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm
                                           focus:outline-none focus:ring-2 focus:ring-amber-300"
                            />
                        </div>
                        <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                            {filtrados.length === 0 ? (
                                <p className="text-xs text-gray-400 italic px-3 py-4 text-center">Nenhum produto encontrado.</p>
                            ) : (
                                filtrados.map((p) => {
                                    const sel = produtoSel?.id === p.id
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setProdutoSel(p)}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${
                                                sel ? 'bg-amber-100' : 'hover:bg-amber-50'
                                            }`}
                                        >
                                            <span className={`text-sm font-medium ${sel ? 'text-amber-800' : 'text-gray-700'}`}>
                                                {p.nome}
                                            </span>
                                            <span className={`text-sm font-bold shrink-0 ${sel ? 'text-amber-700' : 'text-gray-500'}`}>
                                                {formatBRL(p.preco)}
                                            </span>
                                        </button>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Quantidade */}
                    {produtoSel && (
                        <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-800 truncate">{produtoSel.nome}</p>
                                <p className="text-xs text-amber-700 font-semibold">{formatBRL(produtoSel.preco * Math.max(1, qtd))}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setQtd((q) => Math.max(1, q - 1))}
                                    className="w-9 h-9 rounded-xl bg-white border border-amber-200 flex items-center justify-center active:scale-90 transition-transform"
                                    aria-label="Diminuir"
                                >
                                    <Minus className="w-4 h-4 text-amber-700" />
                                </button>
                                <span className="w-7 text-center text-base font-extrabold text-gray-800">{Math.max(1, qtd)}</span>
                                <button
                                    type="button"
                                    onClick={() => setQtd((q) => q + 1)}
                                    className="w-9 h-9 rounded-xl bg-white border border-amber-200 flex items-center justify-center active:scale-90 transition-transform"
                                    aria-label="Aumentar"
                                >
                                    <Plus className="w-4 h-4 text-amber-700" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={enviando}
                        className="flex-1 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-all active:scale-[0.98]"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={enviando || !produtoSel}
                        className="flex-1 h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition-all active:scale-[0.98]
                                   disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Adicionar à fila
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Card de Pedido ───────────────────────────────────────────────────────────
function PedidoCard({
    pedido,
    cfg,
    onAvancar,
    onClickProduto,
    onCancelar,
    onRetirar,
}: {
    pedido: PedidoProducao
    cfg: VarianteConfig
    onAvancar: (id: string, proximoStatus: KanbanColumn) => void
    onClickProduto: (nome: string, produtoId?: string) => void
    onCancelar: (id: string, label: string) => void
    onRetirar: (id: string) => void
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
        pedido.status === 'pendente' ? cfg.btnPreparar :
            pedido.status === 'preparando' ? cfg.btnPronto : ''

    return (
        <div className={`bg-white rounded-2xl shadow-md border overflow-hidden
                        active:scale-[0.99] transition-transform
                        ${pedido.tipo_pedido === 'delivery' ? 'border-blue-200 ring-2 ring-blue-100' : 'border-gray-100'}`}>
            <div className={`px-4 py-3 flex items-center justify-between ${cfg.cardHeader[pedido.status]}`}>
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

            <ul className="px-4 py-3 space-y-1.5">
                {pedido.itens.map((item, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center
                                         text-xs font-bold text-gray-600 shrink-0">
                            {item.quantidade}
                        </span>
                        <button
                            onClick={() => onClickProduto(item.produto_nome, item.produto_id)}
                            className={`font-medium leading-tight text-left underline-offset-2 transition-colors cursor-pointer ${cfg.produtoHover} hover:underline`}
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

            <div className="px-4 pb-4 space-y-2">
                {proximoStatus && btnLabel && (
                    <button
                        onClick={() => onAvancar(pedido.id, proximoStatus)}
                        className={`w-full h-11 rounded-xl text-white text-sm font-bold transition-all
                                    active:scale-95 touch-manipulation shadow-lg ${btnColor}`}
                    >
                        {btnLabel}
                    </button>
                )}
                {pedido.status === 'pronto' && (
                    <button
                        onClick={() => onRetirar(pedido.id)}
                        className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold
                                   transition-all active:scale-95 touch-manipulation shadow-lg shadow-emerald-400/30
                                   flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Confirmar Retirada
                    </button>
                )}
                <button
                    onClick={() => onCancelar(pedido.id, pedido.numero_mesa ? `Mesa ${pedido.numero_mesa}` : 'Balcão')}
                    className="w-full h-9 rounded-xl bg-white border border-red-200 text-red-600 text-xs font-bold
                               hover:bg-red-50 active:scale-95 transition-all touch-manipulation
                               flex items-center justify-center gap-1.5"
                >
                    <X className="w-3.5 h-3.5" />
                    Cancelar pedido
                </button>
            </div>
        </div>
    )
}

// ── Coluna do Kanban ─────────────────────────────────────────────────────────
function Coluna({
    status,
    cfg,
    pedidos,
    onAvancar,
    onClickProduto,
    onCancelar,
    onRetirar,
}: {
    status: KanbanColumn
    cfg: VarianteConfig
    pedidos: PedidoProducao[]
    onAvancar: (id: string, proximoStatus: KanbanColumn) => void
    onClickProduto: (nome: string, produtoId?: string) => void
    onCancelar: (id: string, label: string) => void
    onRetirar: (id: string) => void
}) {
    const colCfg = cfg.colunas[status]
    const Icon = colCfg.icon
    const EmptyIcon = cfg.emptyIcon

    return (
        <div className={`flex flex-col min-h-0 flex-1 max-h-[60vh] lg:max-h-none rounded-2xl ring-2 ${colCfg.ring} overflow-hidden`}>
            <div className={`${colCfg.header} flex items-center justify-between px-4 py-3 shrink-0`}>
                <div className="flex items-center gap-2 text-white font-bold text-base">
                    <Icon className="w-5 h-5" />
                    {colCfg.label}
                </div>
                <span className="bg-white/20 text-white text-sm font-bold px-2.5 py-0.5 rounded-full">
                    {pedidos.length}
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/80">
                {pedidos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
                        <EmptyIcon className="w-8 h-8 opacity-30" />
                        <p className="text-xs text-center">Nenhum pedido aqui</p>
                    </div>
                ) : (
                    pedidos.map((pedido) => (
                        <PedidoCard
                            key={pedido.id}
                            pedido={pedido}
                            cfg={cfg}
                            onAvancar={onAvancar}
                            onClickProduto={onClickProduto}
                            onCancelar={onCancelar}
                            onRetirar={onRetirar}
                        />
                    ))
                )}
            </div>
        </div>
    )
}

// ── Componente Principal ─────────────────────────────────────────────────────
export default function PainelProducaoKanban({ pedidosIniciais, variante, quickAdd }: PainelProducaoKanbanProps) {
    const cfg = VARIANTES[variante]
    const [pedidos, setPedidos] = useState<PedidoProducao[]>(pedidosIniciais)
    const supabase = createClient()
    const audioCtxUnlocked = useRef(false)

    const [fichaAberta, setFichaAberta] = useState<{ nome: string; produtoId?: string } | null>(null)
    const [atalhosAberto, setAtalhosAberto] = useState(false)
    const [quickAddAberto, setQuickAddAberto] = useState(false)

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

    // ── Ação: cancelar pedido ─────────────────────────────────────────────────
    const handleCancelar = useCallback(async (id: string, label: string) => {
        if (!confirm(`Cancelar o pedido de ${label}? Ele sai da fila e não é cobrado.`)) return
        const anteriores = pedidos
        setPedidos((prev) => prev.filter((p) => p.id !== id))
        const { error } = await supabase
            .from('pedidos')
            .update({ status: 'cancelado', updated_at: getAgoraUTC() })
            .eq('id', id)
        if (error) {
            setPedidos(anteriores)
            toast.error('Erro ao cancelar pedido')
        } else {
            toast.success('Pedido cancelado')
        }
    }, [supabase, pedidos])

    // ── Ação: confirmar retirada (bump) ───────────────────────────────────────
    const handleRetirar = useCallback(async (id: string) => {
        const anteriores = pedidos
        setPedidos((prev) => prev.filter((p) => p.id !== id))
        const { error } = await supabase
            .from('pedidos')
            .update({ [cfg.campoRetirado]: true })
            .eq('id', id)
        if (error) {
            setPedidos(anteriores)
            toast.error('Erro ao confirmar retirada')
        } else {
            toast.success('Retirada confirmada')
        }
    }, [supabase, pedidos, cfg.campoRetirado])

    // ── Atalhos de teclado ───────────────────────────────────────────────────
    const handleKeyPress = useCallback((key: string) => {
        if (fichaAberta || atalhosAberto || quickAddAberto) {
            if (key === 'Escape') {
                setFichaAberta(null)
                setAtalhosAberto(false)
                setQuickAddAberto(false)
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

        if (lowerKey === 'p' || key === '1') {
            if (pendentes.length > 0) {
                handleAvancar(pendentes[0].id, 'preparando')
                toast.info(`⌨️ Iniciando preparo — Mesa ${pendentes[0].numero_mesa ?? 'Balcão'}`)
            } else {
                toast.info('Nenhum pedido pendente')
            }
            return
        }

        if (lowerKey === 'd' || key === '2') {
            if (preparando.length > 0) {
                handleAvancar(preparando[0].id, 'pronto')
                toast.success(`⌨️ Pronto! — Mesa ${preparando[0].numero_mesa ?? 'Balcão'}`)
            } else {
                toast.info('Nenhum pedido em preparo')
            }
            return
        }

        if (key === '?') {
            setAtalhosAberto(true)
        }
    }, [pedidos, handleAvancar, fichaAberta, atalhosAberto, quickAddAberto])

    useKeyPress(handleKeyPress)

    const handleClickProduto = useCallback((nome: string, produtoId?: string) => {
        setFichaAberta({ nome, produtoId })
    }, [])

    // Quick-add: insere o pedido na hora (dedup por id evita duplicar o eco do realtime)
    const handleQuickAddCriado = useCallback((pedido: PedidoProducao) => {
        setPedidos((prev) => (prev.some((p) => p.id === pedido.id) ? prev : [pedido, ...prev]))
    }, [])

    // ── Realtime Subscription ────────────────────────────────────────────────
    useEffect(() => {
        const channel = supabase
            .channel(cfg.canal)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'pedidos' },
                async (payload) => {
                    const novo = payload.new as any

                    if (novo.status === 'entregue' || novo.status === 'cancelado') return
                    if (!cfg.aceitaNovo(novo)) return

                    const { data: itens } = await supabase
                        .from('itens_pedido')
                        .select('quantidade, produto_id, produtos(nome)')
                        .eq('pedido_id', novo.id)

                    const itensMapped: ItemPedidoProducao[] = (itens ?? []).map((i: any) => ({
                        quantidade: i.quantidade,
                        produto_nome: i.produtos?.nome ?? 'Produto',
                        produto_id: i.produto_id,
                    }))

                    const pedidoNovo: PedidoProducao = {
                        id: novo.id,
                        numero_mesa: novo.numero_mesa,
                        total: novo.total,
                        status: novo.status,
                        tipo_pedido: novo.tipo_pedido || 'local',
                        created_at: novo.created_at,
                        itens: itensMapped,
                    }

                    setPedidos((prev) => (prev.some((p) => p.id === pedidoNovo.id) ? prev : [pedidoNovo, ...prev]))

                    if (audioCtxUnlocked.current) playBeep()
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'pedidos' },
                (payload) => {
                    const atualizado = payload.new as any

                    // Sai da fila: pago/cancelado OU retirado (bump)
                    if (atualizado.status === 'entregue' || atualizado.status === 'cancelado' || atualizado[cfg.campoRetirado] === true) {
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
    }, [supabase, cfg])

    const pendentes = pedidos.filter((p) => p.status === 'pendente')
    const preparandoList = pedidos.filter((p) => p.status === 'preparando')
    const prontos = pedidos.filter((p) => p.status === 'pronto')

    return (
        <>
            {/* Barra de ações do quick-add (somente Cafeteria) */}
            {quickAdd && (
                <div className="flex justify-end shrink-0 -mt-1">
                    <button
                        onClick={() => setQuickAddAberto(true)}
                        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white
                                   font-bold text-sm shadow-lg shadow-amber-400/30 active:scale-95 transition-all touch-manipulation"
                    >
                        <Plus className="w-4 h-4" />
                        Adicionar item
                    </button>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4 lg:h-[calc(100vh-8rem)] min-h-0">
                <Coluna status="pendente" cfg={cfg} pedidos={pendentes} onAvancar={handleAvancar} onClickProduto={handleClickProduto} onCancelar={handleCancelar} onRetirar={handleRetirar} />
                <Coluna status="preparando" cfg={cfg} pedidos={preparandoList} onAvancar={handleAvancar} onClickProduto={handleClickProduto} onCancelar={handleCancelar} onRetirar={handleRetirar} />
                <Coluna status="pronto" cfg={cfg} pedidos={prontos} onAvancar={handleAvancar} onClickProduto={handleClickProduto} onCancelar={handleCancelar} onRetirar={handleRetirar} />
            </div>

            {fichaAberta && (
                <ModalFichaTecnica
                    produtoNome={fichaAberta.nome}
                    produtoId={fichaAberta.produtoId}
                    onClose={() => setFichaAberta(null)}
                />
            )}

            {atalhosAberto && (
                <ModalAtalhos onClose={() => setAtalhosAberto(false)} />
            )}

            {quickAddAberto && quickAdd && (
                <ModalQuickAdd
                    produtos={quickAdd.produtos}
                    vendedorId={quickAdd.vendedorId}
                    onClose={() => setQuickAddAberto(false)}
                    onCriado={handleQuickAddCriado}
                />
            )}
        </>
    )
}
