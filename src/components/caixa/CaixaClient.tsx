'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import { toast } from 'sonner'
import {
    Search, Receipt, Banknote, CreditCard, Smartphone, ArrowDownCircle,
    ArrowUpCircle, ChevronRight, RefreshCw, CheckCircle2, X,
    DollarSign, Clock, AlertTriangle, Hash, User, Star, Printer, Lock, Copy, BadgePercent,
    Loader2, KeyRound, Eye, EyeOff, Ban
} from 'lucide-react'
import { dataHoraLocalVisual, getAgoraUTC } from '@/lib/timezone'
import { unformatCPF, isValidCPF } from '@/lib/formatters'
import CpfNotaInput from '@/components/shared/CpfNotaInput'
import DescontoModal from '@/components/shared/DescontoModal'
import { round2, distribuirDesconto } from '@/lib/desconto'
import { toNum } from '@/lib/num'
import { registrarAuditLog } from '@/lib/audit-log'
import { QRCodeSVG } from 'qrcode.react'
import { gerarPixCopiaECola, PIX_RECEBEDOR } from '@/lib/pix'
import DanfeNFCePrint from '@/components/caixa/DanfeNFCePrint'
import { useThermalPrinter } from '@/components/shared/ThermalPrinterContext'
import SeletorImpressao from '@/components/shared/SeletorImpressao'
import { type OpcaoImpressao, opcaoImpressaoPadrao, resolverImpressao } from '@/lib/impressao'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ItemPedidoPDV {
    id: string
    quantidade: number
    preco_unitario: number
    subtotal: number
    produto: {
        id?: string
        codigo?: string | null
        nome: string
        unidade_medida?: string | null
        ncm?: string | null
        cfop?: string | null
        csosn?: string | null
    } | null
}

interface PedidoPDV {
    id: string
    numero_mesa: number | null
    comanda_id: string | null
    cliente_id: string | null
    total: number
    status: string
    created_at: string
    tipo_pedido?: string | null
    destino_cozinha?: boolean
    destino_cafeteria?: boolean
    observacoes?: string | null
    cliente: { nome: string; cpf?: string | null } | null
    comanda: { numero: number } | null
    itens_pedido: ItemPedidoPDV[]
}

// ─── Conta: agrupamento de pedidos abertos por mesa/comanda/cliente ────────────
//
// Ponto 4: vários "Novo Pedido" da mesma mesa viram UMA conta no caixa, paga de
// uma vez. A identidade segue a prioridade escolhida: Comanda → Mesa → Cliente.
// Balcão/venda avulsa (sem nenhum dos três) fica como conta individual.
interface Conta {
    key: string
    numeroMesa: number | null
    comandaNumero: number | null
    clienteNome: string | null
    clienteCpf: string | null
    label: string
    pedidos: PedidoPDV[]
    itens: ItemPedidoPDV[]   // itens de todos os pedidos da conta, combinados
    total: number
    createdAt: string         // mais antigo da conta (pra "aguardando há")
}

// Chave de agrupamento. Comanda é a identidade mais forte; depois mesa; depois
// cliente; senão o próprio pedido (balcão avulso permanece individual).
function chaveConta(p: PedidoPDV): string {
    if (p.comanda_id) return `comanda:${p.comanda_id}`
    if (p.numero_mesa != null) return `mesa:${p.numero_mesa}`
    if (p.cliente_id) return `cliente:${p.cliente_id}`
    return `pedido:${p.id}`
}

function rotuloConta(p: PedidoPDV): string {
    if (p.comanda?.numero != null) return `Comanda ${p.comanda.numero}`
    if (p.numero_mesa != null) return `Mesa ${p.numero_mesa}`
    if (p.cliente?.nome) return p.cliente.nome
    return 'Balcão'
}

// Normaliza um pedido cru do Supabase em PedidoPDV: achata as relações
// (cliente/comanda/produto vêm como array OU objeto) e — CRÍTICO — coage os
// campos `numeric` (que chegam como STRING via PostgREST) pra number real.
// Sem isso, somar totais vira concatenação de string. Ver [[src/lib/num.ts]].
function normalizarPedido(p: any): PedidoPDV {
    return {
        id: p.id,
        numero_mesa: p.numero_mesa,
        comanda_id: p.comanda_id ?? null,
        cliente_id: p.cliente_id ?? null,
        total: toNum(p.total),
        status: p.status,
        created_at: p.created_at,
        tipo_pedido: p.tipo_pedido ?? null,
        destino_cozinha: p.destino_cozinha ?? undefined,
        destino_cafeteria: p.destino_cafeteria ?? undefined,
        observacoes: p.observacoes ?? null,
        cliente: Array.isArray(p.cliente) ? (p.cliente[0] ?? null) : p.cliente,
        comanda: Array.isArray(p.comanda) ? (p.comanda[0] ?? null) : p.comanda,
        itens_pedido: (p.itens_pedido ?? []).map((i: any) => ({
            id: i.id,
            quantidade: toNum(i.quantidade),
            preco_unitario: toNum(i.preco_unitario),
            subtotal: toNum(i.subtotal),
            produto: Array.isArray(i.produto) ? (i.produto[0] ?? null) : i.produto,
        })),
    }
}

// Agrupa pedidos prontos em contas, preservando a ordem (mais antigo primeiro).
function agruparContas(pedidos: PedidoPDV[]): Conta[] {
    const mapa = new Map<string, Conta>()
    for (const p of pedidos) {
        const key = chaveConta(p)
        const existente = mapa.get(key)
        if (existente) {
            existente.pedidos.push(p)
            existente.itens.push(...p.itens_pedido)
            // round2 + toNum: blindagem contra ruído de float e contra total
            // que por acaso ainda chegue como string.
            existente.total = round2(existente.total + toNum(p.total))
            if (new Date(p.created_at) < new Date(existente.createdAt)) {
                existente.createdAt = p.created_at
            }
            // Completa rótulo/cliente caso o 1º pedido não tivesse a info
            if (existente.comandaNumero == null && p.comanda?.numero != null) existente.comandaNumero = p.comanda.numero
            if (existente.numeroMesa == null && p.numero_mesa != null) existente.numeroMesa = p.numero_mesa
            if (!existente.clienteNome && p.cliente?.nome) {
                existente.clienteNome = p.cliente.nome
                existente.clienteCpf = p.cliente.cpf ?? null
            }
        } else {
            mapa.set(key, {
                key,
                numeroMesa: p.numero_mesa,
                comandaNumero: p.comanda?.numero ?? null,
                clienteNome: p.cliente?.nome ?? null,
                clienteCpf: p.cliente?.cpf ?? null,
                label: rotuloConta(p),
                pedidos: [p],
                itens: [...p.itens_pedido],
                total: toNum(p.total),
                createdAt: p.created_at,
            })
        }
    }
    return Array.from(mapa.values())
}

interface Props {
    usuarioId: string
    usuarioNome: string
    aberturaHoje: { id: string; valor: number; saldo: number; created_at: string } | null
    saldoAtual: number | null
    pedidosProntosIniciais: PedidoPDV[]
}

type FormaPagamento = 'dinheiro' | 'pix' | 'debito' | 'credito'

interface NfceInfo {
    ok: boolean
    chaveAcesso?: string
    danfeUrl?: string
    /** QR-Code oficial (com hash CSC) vindo do XML autorizado. */
    qrCodeUrl?: string
    erro?: string
}

// UMA nota fiscal por CONTA (cliente/mesa/comanda): os itens de todos os
// pedidos da conta são combinados numa única NFC-e e num único cupom. Os ids
// de todos os pedidos cobertos ficam em `pedidoIds` (pra gravar a mesma chave
// em cada um e permitir reemissão).
interface ReciboPedido {
    pedidoId: string
    /** Todos os pedidos da conta cobertos por ESTA nota. */
    pedidoIds?: string[]
    itens: ItemPedidoPDV[]
    total: number                // total LÍQUIDO (já com desconto)
    desconto?: number            // desconto concedido na conta (R$)
    nfce?: NfceInfo
    /** CPF formatado (snapshot pra reemitir). Vazio se não informado. */
    cpfCliente?: string
}

interface DadosRecibo {
    contaLabel: string
    clienteNome: string | null
    itens: ItemPedidoPDV[]       // combinados (exibição)
    total: number                // total LÍQUIDO da conta (já com desconto)
    desconto: number             // desconto concedido (R$)
    valorPago: number
    troco: number
    formaPagamento: FormaPagamento
    pontosGanhos: number
    dataHora: string
    pedidos: ReciboPedido[]      // um por pedido — NFC-e + reimpressão
    /** Se o CUPOM FISCAL (DANFE) deve sair na impressora. A NFC-e é SEMPRE
     *  emitida e declarada à SEFAZ; isto controla apenas a impressão do papel.
     *  A Nota de Pedido tem impressão própria (decidida no handleFinalizarVenda). */
    imprimirNota: boolean
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

// Cor própria por forma de pagamento — dá vida e diferencia visualmente.
// Mantém um tom pastel mesmo quando inativo, e sólido quando selecionado.
const FORMA_STYLE: Record<FormaPagamento, { active: string; inactive: string }> = {
    dinheiro: {
        active: 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-200',
        inactive: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300',
    },
    pix: {
        active: 'bg-teal-500 border-teal-500 text-white shadow-md shadow-teal-200',
        inactive: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 hover:border-teal-300',
    },
    debito: {
        active: 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200',
        inactive: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300',
    },
    credito: {
        active: 'bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-200',
        inactive: 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 hover:border-violet-300',
    },
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
    const impressora = useThermalPrinter()

    // Imprime o cupom fiscal da CONTA (1 NFC-e = 1 cupom). valorPago/troco vêm do
    // nível da conta (caixa), refletindo o pagamento real do cliente.
    // Retorna true só quando o cupom foi efetivamente impresso (pra rastrear falha).
    const imprimirCupomPedido = useCallback(async (
        p: ReciboPedido,
        forma: FormaPagamento,
        dataHora: string,
        valorPago: number,
        troco: number,
    ): Promise<boolean> => {
        if (!p.nfce?.ok || !p.nfce.chaveAcesso) return false
        return impressora.imprimir({
            razaoSocial: process.env.NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL || 'BUGRA LTDA',
            cnpj: process.env.NEXT_PUBLIC_EMPRESA_CNPJ || '',
            inscricaoEstadual: process.env.NEXT_PUBLIC_EMPRESA_IE,
            endereco: process.env.NEXT_PUBLIC_EMPRESA_ENDERECO,
            chaveAcesso: p.nfce.chaveAcesso,
            qrCodeUrl: p.nfce.qrCodeUrl,
            itens: p.itens.map((i) => ({
                quantidade: i.quantidade,
                precoUnitario: i.preco_unitario,
                subtotal: i.subtotal,
                nome: i.produto?.nome ?? 'Produto',
                codigo: i.produto?.codigo ?? null,
            })),
            total: p.total,
            desconto: p.desconto ?? 0,
            valorPago,
            troco,
            formaPagamentoLabel: FORMA_LABEL[forma],
            dataHora,
            cpfCliente: p.cpfCliente,
        })
    }, [impressora])

    // Imprime o(s) cupom(ns) da conta. Retorna true se TODAS as notas saíram.
    const imprimirReciboAuto = useCallback(async (r: DadosRecibo): Promise<boolean> => {
        const comNota = r.pedidos.filter((p) => p.nfce?.ok && p.nfce.chaveAcesso)
        if (comNota.length === 0) return false
        let todasOk = true
        for (const p of comNota) {
            const ok = await imprimirCupomPedido(p, r.formaPagamento, r.dataHora, r.valorPago, r.troco)
            if (!ok) todasOk = false
        }
        return todasOk
    }, [imprimirCupomPedido])

    // Imprime a NOTA DE PEDIDO consolidada da CONTA (todos os itens de todos os
    // pedidos numa lista única flat). Não depende da NFC-e — sai na hora do
    // pagamento. Tipo/destino do 1º pedido; observações juntas de todos.
    const imprimirNotaConta = useCallback(async (
        conta: {
            label: string; clienteNome: string | null; comandaNumero: number | null
            numeroMesa: number | null; pedidos: PedidoPDV[]
        },
        itens: ItemPedidoPDV[],
        total: number,
        forma: FormaPagamento,
        dataHora: string,
    ): Promise<boolean> => {
        const p0 = conta.pedidos[0]
        const destino = p0?.destino_cozinha ? 'COZINHA' : p0?.destino_cafeteria ? 'CAFETERIA' : 'CAIXA'
        const obs = conta.pedidos.map((p) => p.observacoes).filter(Boolean).join(' | ') || null
        return impressora.imprimirComprovantePedido({
            razaoSocial: process.env.NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL || 'BUGRA LTDA',
            cnpj: process.env.NEXT_PUBLIC_EMPRESA_CNPJ || '',
            tipoPedido: p0?.tipo_pedido || 'local',
            destino,
            numeroMesa: conta.numeroMesa,
            comandaNumero: conta.comandaNumero,
            clienteNome: conta.clienteNome,
            itens: itens.map((i) => ({
                quantidade: i.quantidade,
                precoUnitario: i.preco_unitario,
                subtotal: i.subtotal,
                nome: i.produto?.nome ?? 'Produto',
                unidadeMedida: i.produto?.unidade_medida ?? null,
            })),
            total,
            formaPagamentoLabel: FORMA_LABEL[forma],
            observacoes: obs,
            dataHora,
        })
    }, [impressora])

    // Estado de abertura do caixa
    const [aberturaHoje, setAberturaHoje] = useState(aberturaHojeInicial)
    const [saldoAtual, setSaldoAtual] = useState<number>(toNum(saldoInicialProp))
    const [modalAbertura, setModalAbertura] = useState(!aberturaHojeInicial)
    const [valorAbertura, setValorAbertura] = useState('')
    const [processandoAbertura, setProcessandoAbertura] = useState(false)

    // Estado do PDV. Normaliza já na carga inicial (os totais vêm do servidor
    // como string numeric — ver normalizarPedido / [[src/lib/num.ts]]).
    const [pedidos, setPedidos] = useState<PedidoPDV[]>(
        () => (pedidosProntosIniciais ?? []).map(normalizarPedido)
    )
    const [busca, setBusca] = useState('')
    // Seleção é por CONTA (mesa/comanda/cliente), não mais por pedido individual.
    const [contaSelecionadaKey, setContaSelecionadaKey] = useState<string | null>(null)
    const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('dinheiro')
    const [valorRecebido, setValorRecebido] = useState('')
    // O que sai na impressora ao finalizar (papel só). A NFC-e é sempre emitida.
    // Começa no padrão da casa (flag NEXT_PUBLIC_IMPRIMIR_NFCE) e volta a ele a
    // cada venda finalizada — o operador ajusta pontualmente por venda.
    const [opcaoImpressao, setOpcaoImpressao] = useState<OpcaoImpressao>(opcaoImpressaoPadrao)
    // Desconto aplicado na conta selecionada (R$). Modal R$/%.
    const [descontoConta, setDescontoConta] = useState(0)
    const [modalDesconto, setModalDesconto] = useState(false)
    const [processandoVenda, setProcessandoVenda] = useState(false)
    const [processandoCancelamento, setProcessandoCancelamento] = useState(false)
    const [carregandoPedidos, setCarregandoPedidos] = useState(false)

    // Modal de cancelamento (conta inteira OU itens específicos), liberado só
    // com a senha de exclusão do ADM. O caixa nunca vê/sabe a senha.
    const [modalCancelar, setModalCancelar] = useState(false)
    const [modoCancelamento, setModoCancelamento] = useState<'conta' | 'itens'>('conta')
    const [itensParaCancelar, setItensParaCancelar] = useState<Set<string>>(new Set())
    const [senhaCancelamento, setSenhaCancelamento] = useState('')
    const [revelarSenhaCancel, setRevelarSenhaCancel] = useState(false)

    // Modal Cupom Digital
    const [reciboAtual, setReciboAtual] = useState<DadosRecibo | null>(null)
    // Status da impressão automática do cupom: idle (sem tentar) | ok | falha
    const [statusImpressao, setStatusImpressao] = useState<'idle' | 'ok' | 'falha'>('idle')
    // NFC-e emitida em segundo plano: a venda fecha na hora e a nota sai depois,
    // sem travar o caixa esperando a SEFAZ. Guarda o pedidoId do recibo cuja nota
    // está sendo emitida (null = nenhuma) — id em vez de bool pra não confundir se
    // duas vendas seguidas estiverem emitindo ao mesmo tempo.
    const [emitindoNfceId, setEmitindoNfceId] = useState<string | null>(null)
    // Guard: garante auto-impressão UMA vez por recibo (evita reimpressão quando a
    // identidade da impressora muda — reaquisição/retry — e recria os callbacks).
    const autoPrintReciboRef = useRef<DadosRecibo | null>(null)

    // CPF na nota (opcional). Formatado: 000.000.000-00
    const [cpfNota, setCpfNota] = useState('')

    // Modal Sangria / Reforço
    const [modalMovimentacao, setModalMovimentacao] = useState<'sangria' | 'reforco' | null>(null)
    const [valorMovimentacao, setValorMovimentacao] = useState('')
    const [obsMovimentacao, setObsMovimentacao] = useState('')
    const [processandoMov, setProcessandoMov] = useState(false)

    // Modal PIX
    const [modalPix, setModalPix] = useState(false)

    // Modal Fechamento de Caixa
    interface ResumoCaixa {
        aberto: boolean
        abertura_valor: number
        saldo_atual: number
        total_vendas: number
        qtd_vendas: number
        total_dinheiro: number
        total_pix: number
        total_debito: number
        total_credito: number
        total_sangrias: number
        total_reforcos: number
        saldo_esperado_dinheiro: number
    }
    const [modalFechamento, setModalFechamento] = useState(false)
    const [resumoFechamento, setResumoFechamento] = useState<ResumoCaixa | null>(null)
    const [carregandoResumo, setCarregandoResumo] = useState(false)
    const [valorContado, setValorContado] = useState('')
    const [obsFechamento, setObsFechamento] = useState('')
    const [processandoFechamento, setProcessandoFechamento] = useState(false)
    // Imprimir o comprovante de fechamento ao confirmar (opt-out — as vezes nao quer)
    const [imprimirComprovante, setImprimirComprovante] = useState(true)

    // ── Contas (pedidos agrupados por mesa/comanda/cliente) ────────────────────
    const contas = useMemo(() => agruparContas(pedidos), [pedidos])
    const contaSelecionada = useMemo(
        () => contas.find((c) => c.key === contaSelecionadaKey) ?? null,
        [contas, contaSelecionadaKey]
    )

    // Trocar de conta zera o desconto (cada conta tem o seu).
    useEffect(() => { setDescontoConta(0) }, [contaSelecionadaKey])

    // ── Carregar pedidos prontos ──────────────────────────────────────────────

    const carregarPedidosProntos = useCallback(async () => {
        setCarregandoPedidos(true)
        try {
            const { data, error } = await supabase
                .from('pedidos')
                .select(`
                    id, numero_mesa, comanda_id, cliente_id, total, status, created_at,
                    tipo_pedido, destino_cozinha, destino_cafeteria, observacoes,
                    cliente:clientes ( nome, cpf ),
                    comanda:comandas!pedidos_comanda_id_fkey ( numero ),
                    itens_pedido (
                        id, quantidade, preco_unitario, subtotal,
                        produto:produtos ( id, codigo, nome, unidade_medida, ncm, cfop, csosn )
                    )
                `)
                .eq('status', 'pronto')
                .order('created_at', { ascending: true })

            if (error) {
                toast.error('Erro ao carregar pedidos')
            } else {
                const pedidosNormalizados: PedidoPDV[] = (data ?? []).map(normalizarPedido)
                setPedidos(pedidosNormalizados)
                // Se a conta selecionada não tem mais pedidos prontos, limpa a seleção
                if (contaSelecionadaKey) {
                    const keysAtuais = new Set(pedidosNormalizados.map(chaveConta))
                    if (!keysAtuais.has(contaSelecionadaKey)) setContaSelecionadaKey(null)
                }
            }
        } catch {
            toast.error('Falha ao buscar pedidos prontos')
        } finally {
            setCarregandoPedidos(false)
        }
    }, [contaSelecionadaKey, supabase])

    // Ref pra última versão de carregarPedidosProntos — evita re-inscrever o canal
    // realtime / recriar o intervalo a cada troca de conta selecionada.
    const carregarRef = useRef(carregarPedidosProntos)
    useEffect(() => { carregarRef.current = carregarPedidosProntos }, [carregarPedidosProntos])

    // Polling a cada 30s (rede de segurança caso o realtime caia)
    useEffect(() => {
        const interval = setInterval(() => { void carregarRef.current() }, 30000)
        return () => clearInterval(interval)
    }, [])

    // ── Realtime: mantém o caixa sincronizado (canal próprio, não toca no kanban) ──
    // Ponto 2: garante que toda mesa/pedido que vira 'pronto' apareça no caixa na
    // hora, e que pedidos pagos/cancelados saiam — sem depender do polling de 30s.
    useEffect(() => {
        const channel = supabase
            .channel('caixa_pedidos_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'pedidos' },
                () => { void carregarRef.current() }
            )
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [supabase])

    // Impressao automatica: dispara UMA vez por recibo (guard por ref). Sem o guard,
    // mudar a impressora (reaquisicao/retry) recria imprimirReciboAuto e o efeito
    // re-rodaria, reimprimindo o cupom. Re-tentativas ficam no botao manual.
    useEffect(() => {
        if (!reciboAtual) { autoPrintReciboRef.current = null; return }
        if (autoPrintReciboRef.current === reciboAtual) return
        // Operador NÃO pediu o cupom fiscal em papel (opções "Só Pedido" ou "Não
        // imprimir"): não imprime o DANFE na térmica. A NFC-e já foi emitida à
        // SEFAZ do mesmo jeito. O statusImpressao é preservado — se a Nota de
        // Pedido saiu (handleFinalizarVenda), ela já registrou ok/falha; o reset
        // 'idle' de cada nova venda é feito no próprio handler.
        if (!reciboAtual.imprimirNota) { autoPrintReciboRef.current = reciboAtual; return }
        // Cupom fiscal pedido ("Nota + Pedido" ou "Só Nota"): imprime o DANFE
        // assim que a nota fica OK. A nota é sempre emitida — isto é só o papel.
        if (reciboAtual.pedidos.some((p) => p.nfce?.ok && p.nfce.chaveAcesso)) {
            autoPrintReciboRef.current = reciboAtual
            setStatusImpressao('idle')
            imprimirReciboAuto(reciboAtual).then((ok) => setStatusImpressao(ok ? 'ok' : 'falha'))
        }
    }, [reciboAtual, imprimirReciboAuto])

    // Reimpressão manual a partir do recibo (botão), atualizando o status.
    const reimprimirReciboManual = useCallback(async () => {
        if (!reciboAtual) return
        const ok = await imprimirReciboAuto(reciboAtual)
        setStatusImpressao(ok ? 'ok' : 'falha')
        if (ok) toast.success('Cupom reimpresso')
    }, [reciboAtual, imprimirReciboAuto])

    // ── Filtro de busca (sobre as contas agrupadas) ────────────────────────────

    const contasFiltradas = contas.filter((c) => {
        if (!busca) return true
        const termo = busca.toLowerCase()
        const mesaMatch = c.numeroMesa?.toString().includes(termo)
        const comandaMatch = c.comandaNumero?.toString().includes(termo)
        const clienteMatch = c.clienteNome?.toLowerCase().includes(termo)
        return Boolean(mesaMatch || comandaMatch || clienteMatch)
    })

    // ── Cálculo de desconto / total líquido / troco ────────────────────────────

    const totalBrutoConta = contaSelecionada?.total ?? 0
    // Desconto nunca passa do bruto (defensivo — o modal já limita).
    const descontoAplicado = Math.min(round2(descontoConta), round2(totalBrutoConta))
    const totalLiquidoConta = round2(Math.max(0, totalBrutoConta - descontoAplicado))

    const valorRecebidoNum = parseFloat(valorRecebido.replace(',', '.')) || 0
    const troco = formaPagamento === 'dinheiro'
        ? Math.max(0, valorRecebidoNum - totalLiquidoConta)
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
            setSaldoAtual(toNum(data.saldo))
            setModalAbertura(false)
            toast.success(`Caixa aberto com fundo de ${formatCurrency(valor)}`)

            registrarAuditLog({
                acao: 'caixa.abertura',
                entidade: 'caixa',
                entidade_id: data.id,
                detalhes: { valor, usuario: usuarioNome },
                usuario_id: usuarioId,
                usuario_nome: usuarioNome,
            })
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido'
            toast.error('Erro ao abrir caixa: ' + msg)
        } finally {
            setProcessandoAbertura(false)
        }
    }

    // ── Finalizar Venda ───────────────────────────────────────────────────────

    async function emitirNFCe(pedido: PedidoPDV, forma: FormaPagamento, cpf?: string, pedidoIdsConta?: string[], descontoNota = 0): Promise<NfceInfo> {
        try {
            const cpfDigits = cpf ? unformatCPF(cpf) : ''
            const cpfClienteEnvio = cpfDigits.length === 11 && isValidCPF(cpfDigits) ? cpfDigits : undefined

            const res = await fetch('/api/nfce/emitir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pedidoId: pedido.id,
                    // Grava a mesma chave em TODOS os pedidos da conta (1 nota/conta).
                    pedidoIds: pedidoIdsConta && pedidoIdsConta.length > 0 ? pedidoIdsConta : [pedido.id],
                    // pedido.total já é o LÍQUIDO; o desconto vai à parte pro rateio por item.
                    total: pedido.total,
                    desconto: descontoNota,
                    formaPagamento: forma,
                    cpfCliente: cpfClienteEnvio,
                    itens: pedido.itens_pedido.map((i) => ({
                        codigo: (i.produto?.codigo && i.produto.codigo.trim()) || i.produto?.id || i.id,
                        nome: i.produto?.nome ?? 'Produto',
                        ncm: i.produto?.ncm || undefined,
                        cfop: i.produto?.cfop ? Number(i.produto.cfop) : undefined,
                        csosn: i.produto?.csosn || undefined,
                        quantidade: i.quantidade,
                        valorUnitario: i.preco_unitario,
                        unidade: i.produto?.unidade_medida || 'UN',
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
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'erro de rede'
            toast.warning('Venda registrada, mas NFC-e falhou', { description: msg })
            return { ok: false, erro: msg }
        }
    }

    async function handleReemitirNFCe() {
        if (!reciboAtual) return
        // Reemite apenas as notas que falharam; mantém as que já saíram.
        const atualizados: ReciboPedido[] = []
        for (const p of reciboAtual.pedidos) {
            if (p.nfce?.ok) { atualizados.push(p); continue }
            const pedidoMin: PedidoPDV = {
                id: p.pedidoId,
                numero_mesa: null,
                comanda_id: null,
                cliente_id: null,
                total: p.total,
                status: 'entregue',
                created_at: '',
                cliente: reciboAtual.clienteNome ? { nome: reciboAtual.clienteNome } : null,
                comanda: null,
                itens_pedido: p.itens,
            }
            const nfce = await emitirNFCe(pedidoMin, reciboAtual.formaPagamento, p.cpfCliente, p.pedidoIds, p.desconto ?? 0)
            atualizados.push({ ...p, nfce })
        }
        setReciboAtual({ ...reciboAtual, pedidos: atualizados })
    }

    // Emite a NFC-e da conta em SEGUNDO PLANO (não trava a finalização). Quando a
    // SEFAZ responde, anexa a nota ao recibo — se ele ainda for o que está na tela.
    // O useEffect de auto-impressão dispara sozinho ao ver a nota OK.
    async function emitirNotaConta(
        pedidoConta: PedidoPDV,
        forma: FormaPagamento,
        cpf: string,
        idsConta: string[],
        descontoEfetivo: number,
        reciboPedidoId: string,
    ) {
        setEmitindoNfceId(reciboPedidoId)
        try {
            const nfceConta = await emitirNFCe(pedidoConta, forma, cpf, idsConta, descontoEfetivo)
            setReciboAtual((prev) => {
                if (!prev || prev.pedidos[0]?.pedidoId !== reciboPedidoId) return prev
                return { ...prev, pedidos: prev.pedidos.map((p) => ({ ...p, nfce: nfceConta })) }
            })
        } finally {
            setEmitindoNfceId((id) => (id === reciboPedidoId ? null : id))
        }
    }

    // Finaliza a CONTA inteira: paga todos os pedidos agrupados de uma vez.
    // A NFC-e é emitida em segundo plano (ver emitirNotaConta).
    async function handleFinalizarVenda(opcao: OpcaoImpressao) {
        if (!contaSelecionada || !aberturaHoje) return

        // Desacopla os dois papéis. A NFC-e é SEMPRE emitida à SEFAZ (mais abaixo,
        // fora de qualquer condição de impressão); estes flags controlam só o papel.
        const { imprimirPedido, imprimirNota } = resolverImpressao(opcao)

        const totalBruto = contaSelecionada.total
        const descontoTotal = Math.min(round2(descontoAplicado), round2(totalBruto))
        const totalLiquido = round2(totalBruto - descontoTotal)
        const valorPago = formaPagamento === 'dinheiro' ? valorRecebidoNum : totalLiquido

        if (formaPagamento === 'dinheiro' && valorPago < totalLiquido) {
            toast.error('Valor recebido menor que o total da conta')
            return
        }

        // Zera o status de impressão da venda anterior — o cupom fiscal/Nota de
        // Pedido desta venda registram o próprio resultado ao sair.
        setStatusImpressao('idle')
        setProcessandoVenda(true)
        try {
            // Rateia o desconto da conta entre os pedidos (proporcional ao total
            // de cada um), pra que cada finalizar_venda_pdv grave o líquido certo.
            const descontosPorPedido = distribuirDesconto(
                descontoTotal,
                contaSelecionada.pedidos.map((p) => p.total),
            )

            // 1) Cobrança por pedido (estoque + caixa). Mantida por pedido porque
            //    finalizar_venda_pdv baixa estoque e lança o movimento de caixa.
            const pedidosPagos: PedidoPDV[] = []
            const descontosPagos: number[] = []
            let falhasFinalizacao = 0

            for (let i = 0; i < contaSelecionada.pedidos.length; i++) {
                const pedido = contaSelecionada.pedidos[i]
                const dPedido = descontosPorPedido[i] ?? 0
                const { error } = await supabase.rpc('finalizar_venda_pdv', {
                    p_pedido_id: pedido.id,
                    p_forma_pagamento: formaPagamento,
                    p_valor_pago: round2(pedido.total - dPedido),
                    p_usuario_id: usuarioId,
                    p_desconto: dPedido,
                })
                if (error) {
                    falhasFinalizacao++
                    continue
                }
                pedidosPagos.push(pedido)
                descontosPagos.push(dPedido)
            }

            if (pedidosPagos.length === 0) {
                toast.error('Não foi possível finalizar a conta. Atualize e tente novamente.')
                await carregarPedidosProntos()
                return
            }
            if (falhasFinalizacao > 0) {
                toast.warning(`${falhasFinalizacao} pedido(s) da conta seguem abertos e não foram cobrados.`)
            }

            // 2) Recibo da conta — montado JÁ, sem esperar a NFC-e. A nota da conta
            //    (um cupom único com os itens de todos os pedidos pagos) é emitida
            //    em SEGUNDO PLANO; o desconto efetivo é só o dos pedidos pagos.
            const itensConta = pedidosPagos.flatMap((p) => p.itens_pedido)
            const brutoPago = round2(pedidosPagos.reduce((s, p) => s + p.total, 0))
            const descontoEfetivo = round2(descontosPagos.reduce((s, d) => s + d, 0))
            const liquidoPago = round2(brutoPago - descontoEfetivo)
            const idsConta = pedidosPagos.map((p) => p.id)
            const reciboPedidoId = pedidosPagos[0].id
            // pedidoConta.total = líquido (é o que a NFC-e envia como total).
            const pedidoConta: PedidoPDV = { ...pedidosPagos[0], total: liquidoPago, itens_pedido: itensConta }

            const reciboPedidos: ReciboPedido[] = [{
                pedidoId: reciboPedidoId,
                pedidoIds: idsConta,
                itens: itensConta,
                total: liquidoPago,
                desconto: descontoEfetivo,
                nfce: undefined,            // emitida logo a seguir, em segundo plano
                cpfCliente: cpfNota,
            }]

            // MED-06 FIX: Busca saldo atualizado do banco ao invés de calcular no client
            const { data: saldoRow } = await supabase
                .from('caixa')
                .select('saldo')
                .eq('usuario_id', usuarioId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()
            if (saldoRow) setSaldoAtual(toNum(saldoRow.saldo))

            // Pontos de fidelidade sobre o líquido pago (trigger: floor(total/10))
            const pontosGanhos = contaSelecionada.clienteNome
                ? Math.max(Math.floor(liquidoPago / 10), 0)
                : 0

            const recibo: DadosRecibo = {
                contaLabel: contaSelecionada.label,
                clienteNome: contaSelecionada.clienteNome,
                itens: reciboPedidos.flatMap((p) => p.itens),
                total: liquidoPago,
                desconto: descontoEfetivo,
                valorPago,
                troco: formaPagamento === 'dinheiro' ? Math.max(0, valorPago - liquidoPago) : 0,
                formaPagamento,
                pontosGanhos,
                dataHora: dataHoraLocalVisual(getAgoraUTC()),
                pedidos: reciboPedidos,
                imprimirNota,
            }

            registrarAuditLog({
                acao: 'caixa.venda',
                entidade: 'pedidos',
                entidade_id: reciboPedidos[0].pedidoId,
                detalhes: {
                    subtotal: brutoPago,
                    desconto: descontoEfetivo,
                    total: liquidoPago,
                    formaPagamento,
                    valorPago,
                    conta: contaSelecionada.label,
                    pedidos: reciboPedidos.map((p) => p.pedidoId),
                    cliente: contaSelecionada.clienteNome,
                },
                usuario_id: usuarioId,
                usuario_nome: usuarioNome,
            })

            // Snapshot do que a nota precisa, ANTES de resetar os campos do form.
            const formaNota = formaPagamento
            const cpfParaNota = cpfNota

            setReciboAtual(recibo)

            // Nota de Pedido: sai na HORA do pagamento (não depende da NFC-e).
            // Só quando o operador incluiu o Pedido ("Nota + Pedido" ou "Só
            // Pedido"). Consolida todos os itens da conta numa única nota.
            if (imprimirPedido) {
                void imprimirNotaConta(
                    {
                        label: contaSelecionada.label,
                        clienteNome: contaSelecionada.clienteNome,
                        comandaNumero: contaSelecionada.comandaNumero,
                        numeroMesa: contaSelecionada.numeroMesa,
                        pedidos: pedidosPagos,
                    },
                    itensConta, liquidoPago, formaNota, recibo.dataHora,
                ).then((ok) => setStatusImpressao(ok ? 'ok' : 'falha'))
            }

            setContaSelecionadaKey(null)
            setDescontoConta(0)
            setFormaPagamento('dinheiro')
            setValorRecebido('')
            setCpfNota('')
            setOpcaoImpressao(opcaoImpressaoPadrao())
            setModalPix(false)
            await carregarPedidosProntos()

            // Venda já fechada na tela; a NFC-e sai em SEGUNDO PLANO. O recibo se
            // atualiza quando a SEFAZ responde (e o cupom imprime sozinho). Isso
            // elimina o caixa "travar" esperando a emissão da nota.
            void emitirNotaConta(pedidoConta, formaNota, cpfParaNota, idsConta, descontoEfetivo, reciboPedidoId)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido'
            toast.error('Erro ao finalizar venda: ' + msg)
        } finally {
            setProcessandoVenda(false)
        }
    }

    // Abre o modal de cancelamento (conta inteira OU itens específicos). O
    // cancelamento só é liberado com a senha de exclusão do ADM — o caixa
    // apenas aciona o botão, nunca vê a senha.
    function abrirModalCancelar() {
        if (!contaSelecionada) return
        setModoCancelamento('conta')
        setItensParaCancelar(new Set())
        setSenhaCancelamento('')
        setRevelarSenhaCancel(false)
        setModalCancelar(true)
    }

    function toggleItemCancelar(itemId: string) {
        setItensParaCancelar((prev) => {
            const next = new Set(prev)
            if (next.has(itemId)) next.delete(itemId)
            else next.add(itemId)
            return next
        })
    }

    // Valida a senha do ADM (RPC, sem revelar a senha) e executa o cancelamento:
    //  • conta inteira  -> todos os pedidos viram 'cancelado';
    //  • itens marcados -> remove o item (trigger recalcula o total do pedido);
    //                      se um pedido ficar sem itens, ele é cancelado.
    // Pedido 'pronto' ainda não baixou estoque (baixa só na entrega), então não
    // há nada a estornar.
    async function confirmarCancelamento() {
        if (!contaSelecionada) return
        if (!senhaCancelamento.trim()) {
            toast.error('Informe a senha de exclusão do administrador.')
            return
        }
        if (modoCancelamento === 'itens' && itensParaCancelar.size === 0) {
            toast.error('Selecione ao menos um item para cancelar.')
            return
        }

        setProcessandoCancelamento(true)
        try {
            // 1) Valida a senha do ADM. Só TRUE quando há senha configurada e confere.
            const { data: ok, error: errSenha } = await supabase.rpc('fn_verificar_senha_exclusao', {
                p_senha: senhaCancelamento.trim(),
            })
            if (errSenha) throw errSenha
            if (ok !== true) {
                toast.error('Senha incorreta ou não configurada pelo administrador.')
                return
            }

            const conta = contaSelecionada

            if (modoCancelamento === 'conta') {
                const ids = conta.pedidos.map((p) => p.id)
                const { error } = await supabase.from('pedidos').update({ status: 'cancelado' }).in('id', ids)
                if (error) throw error
                registrarAuditLog({
                    acao: 'pedido.cancelamento' as any,
                    entidade: 'pedidos',
                    entidade_id: ids[0],
                    detalhes: { motivo: 'Conta cancelada via Caixa (senha ADM)', conta: conta.label, pedidos: ids },
                    usuario_id: usuarioId,
                    usuario_nome: usuarioNome,
                })
                toast.success(ids.length > 1 ? `Conta de ${conta.label} cancelada` : 'Pedido cancelado')
            } else {
                // Itens específicos. Pra cada pedido: se TODOS os seus itens foram
                // marcados, cancela o pedido; senão remove só os itens marcados.
                const pedidosCancelados: string[] = []
                const itensRemovidos: string[] = []
                for (const pedido of conta.pedidos) {
                    const idsItens = pedido.itens_pedido.map((it) => it.id)
                    const marcados = idsItens.filter((id) => itensParaCancelar.has(id))
                    if (marcados.length === 0) continue
                    if (marcados.length === idsItens.length) {
                        const { error } = await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', pedido.id)
                        if (error) throw error
                        pedidosCancelados.push(pedido.id)
                    } else {
                        const { error } = await supabase.from('itens_pedido').delete().in('id', marcados)
                        if (error) throw error
                        itensRemovidos.push(...marcados)
                    }
                }
                registrarAuditLog({
                    acao: 'pedido.cancelamento' as any,
                    entidade: 'itens_pedido',
                    entidade_id: conta.pedidos[0].id,
                    detalhes: {
                        motivo: 'Itens cancelados via Caixa (senha ADM)',
                        conta: conta.label,
                        itens_removidos: itensRemovidos,
                        pedidos_cancelados: pedidosCancelados,
                    },
                    usuario_id: usuarioId,
                    usuario_nome: usuarioNome,
                })
                toast.success('Itens cancelados')
            }

            setModalCancelar(false)
            await carregarPedidosProntos()
        } catch (err: unknown) {
            toast.error('Erro ao cancelar: ' + (err instanceof Error ? err.message : 'Erro desconhecido'))
        } finally {
            setProcessandoCancelamento(false)
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
            // MED-06 FIX: Busca saldo real antes de calcular para evitar inconsistência por concorrência.
            // BUG-REFORÇO FIX: `saldo` chega do PostgREST como STRING. Sem o toNum,
            // o reforço fazia `"171.11" + 61.9 = "171.1161.9"` (concatenação) e o
            // banco rejeitava ("invalid input syntax for type numeric"). A sangria
            // só escapava porque `-` coage pra número. Ver [[src/lib/num.ts]].
            const { data: saldoRow } = await supabase
                .from('caixa')
                .select('saldo')
                .eq('usuario_id', usuarioId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()
            const saldoReal = toNum(saldoRow?.saldo ?? saldoAtual)

            if (modalMovimentacao === 'sangria' && valor > saldoReal) {
                toast.error(`Saldo insuficiente. Disponível: ${formatCurrency(saldoReal)}`)
                setProcessandoMov(false)
                return
            }

            const novoSaldo = round2(
                modalMovimentacao === 'sangria'
                    ? saldoReal - valor
                    : saldoReal + valor
            )

            const { error } = await supabase.from('caixa').insert({
                usuario_id: usuarioId,
                tipo: modalMovimentacao,
                valor: valor,
                saldo: novoSaldo,
                observacao: obsMovimentacao || null,
            })

            if (error) throw error
            setSaldoAtual(novoSaldo)

            const tipoAcao = modalMovimentacao === 'sangria' ? 'caixa.sangria' : 'caixa.reforco' as const
            registrarAuditLog({
                acao: tipoAcao,
                entidade: 'caixa',
                detalhes: { valor, saldoAnterior: saldoReal, saldoNovo: novoSaldo, observacao: obsMovimentacao },
                usuario_id: usuarioId,
                usuario_nome: usuarioNome,
            })

            toast.success(
                modalMovimentacao === 'sangria'
                    ? `Sangria de ${formatCurrency(valor)} registrada`
                    : `Reforço de ${formatCurrency(valor)} registrado`
            )
            setModalMovimentacao(null)
            setValorMovimentacao('')
            setObsMovimentacao('')
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido'
            toast.error('Erro: ' + msg)
        } finally {
            setProcessandoMov(false)
        }
    }

    // ── Fechamento de Caixa ───────────────────────────────────────────────

    async function abrirModalFechamento() {
        if (!aberturaHoje) {
            toast.error('Não há caixa aberto para fechar.')
            return
        }
        setCarregandoResumo(true)
        setModalFechamento(true)
        setValorContado('')
        setObsFechamento('')
        setImprimirComprovante(true)
        try {
            const { data, error } = await supabase.rpc('resumo_caixa_dia', {
                p_usuario_id: usuarioId,
            })
            if (error) throw error
            if (!data || data.aberto === false) {
                toast.error('Resumo indisponível — caixa não aparece aberto no servidor.')
                setModalFechamento(false)
                return
            }
            setResumoFechamento(data as ResumoCaixa)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido'
            toast.error('Erro ao carregar resumo: ' + msg)
            setModalFechamento(false)
        } finally {
            setCarregandoResumo(false)
        }
    }

    function fecharModalFechamento() {
        setModalFechamento(false)
        setResumoFechamento(null)
        setValorContado('')
        setObsFechamento('')
    }

    async function handleFecharCaixa() {
        const valor = parseFloat(valorContado.replace(',', '.'))
        if (isNaN(valor) || valor < 0) {
            toast.error('Informe o valor contado em dinheiro.')
            return
        }
        if (!confirm('Confirmar fechamento do caixa? Para registrar novas vendas será necessário abrir um novo caixa.')) return

        setProcessandoFechamento(true)
        try {
            const { data, error } = await supabase.rpc('fechar_caixa', {
                p_usuario_id: usuarioId,
                p_valor_contado: valor,
                p_observacao: obsFechamento || null,
            })
            if (error) throw error

            const diferenca = (data?.diferenca ?? 0) as number
            const esperado = (data?.saldo_esperado_dinheiro ?? 0) as number

            registrarAuditLog({
                acao: 'caixa.fechamento',
                entidade: 'caixa',
                entidade_id: data?.fechamento_id,
                detalhes: {
                    valor_contado: valor,
                    saldo_esperado: esperado,
                    diferenca,
                    observacao: obsFechamento,
                    resumo: data?.resumo,
                },
                usuario_id: usuarioId,
                usuario_nome: usuarioNome,
            })

            // Impressao automatica do comprovante (igual NFC-e: silenciosa via WebUSB,
            // so quando o operador deixou marcado e ha impressora pareada).
            if (imprimirComprovante && impressora.conectada && resumoFechamento) {
                void impressora.imprimirComprovanteFechamento({
                    razaoSocial: process.env.NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL || 'BUGRA LTDA',
                    cnpj: process.env.NEXT_PUBLIC_EMPRESA_CNPJ || '',
                    operador: usuarioNome,
                    dataHora: dataHoraLocalVisual(getAgoraUTC()),
                    aberturaValor: resumoFechamento.abertura_valor,
                    totalVendas: resumoFechamento.total_vendas,
                    qtdVendas: resumoFechamento.qtd_vendas,
                    totalDinheiro: resumoFechamento.total_dinheiro,
                    totalPix: resumoFechamento.total_pix,
                    totalDebito: resumoFechamento.total_debito,
                    totalCredito: resumoFechamento.total_credito,
                    totalSangrias: resumoFechamento.total_sangrias,
                    totalReforcos: resumoFechamento.total_reforcos,
                    saldoEsperadoDinheiro: esperado,
                    valorContado: valor,
                    diferenca,
                    observacao: obsFechamento || undefined,
                })
            }

            const msgDif = diferenca === 0
                ? 'sem diferença'
                : diferenca > 0
                    ? `sobra de ${formatCurrency(diferenca)}`
                    : `falta de ${formatCurrency(Math.abs(diferenca))}`
            toast.success(`Caixa fechado (${msgDif}).`)

            // Reseta estado local — força modal de abertura na próxima ação
            fecharModalFechamento()
            setAberturaHoje(null)
            setSaldoAtual(0)
            setModalAbertura(true)
            setContaSelecionadaKey(null)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido'
            if (msg.includes('JA_FECHADO')) {
                toast.error('Este turno já foi fechado. Abra um novo caixa para continuar.')
                setAberturaHoje(null)
                setModalAbertura(true)
                fecharModalFechamento()
            } else if (msg.includes('SEM_ABERTURA')) {
                toast.error('Não há caixa aberto para fechar.')
                fecharModalFechamento()
            } else {
                toast.error('Erro ao fechar caixa: ' + msg)
            }
        } finally {
            setProcessandoFechamento(false)
        }
    }

    // ── Fechar Cupom Digital e resetar PDV ─────────────────────────────────

    function handleNovoAtendimento() {
        setReciboAtual(null)
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <>
            {/* ── DANFE NFC-e oculto pra impressão térmica 80mm (1 cupom por conta) ── */}
            {reciboAtual && reciboAtual.pedidos
                .filter((p) => p.nfce?.ok && p.nfce.chaveAcesso)
                .map((p) => (
                    <DanfeNFCePrint
                        key={p.pedidoId}
                        chaveAcesso={p.nfce!.chaveAcesso!}
                        qrCodeUrl={p.nfce!.qrCodeUrl}
                        itens={p.itens}
                        total={p.total}
                        desconto={p.desconto ?? 0}
                        valorPago={reciboAtual.valorPago}
                        troco={reciboAtual.troco}
                        formaPagamentoLabel={FORMA_LABEL[reciboAtual.formaPagamento]}
                        dataHora={reciboAtual.dataHora}
                        cpfCliente={p.cpfCliente}
                    />
                ))}

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
                            {/* Conta / Cliente / Pedidos unificados */}
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500 font-medium">Conta</span>
                                <span className="font-bold text-gray-800">{reciboAtual.contaLabel}</span>
                            </div>
                            {reciboAtual.clienteNome && reciboAtual.clienteNome !== reciboAtual.contaLabel && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500 font-medium">Cliente</span>
                                    <span className="font-bold text-gray-800">{reciboAtual.clienteNome}</span>
                                </div>
                            )}
                            {reciboAtual.pedidos.length > 1 && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500 font-medium">Pedidos unificados</span>
                                    <span className="font-bold text-gray-800">{reciboAtual.pedidos.length}</span>
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

                            {/* Subtotal + Desconto (só quando houve desconto) */}
                            {reciboAtual.desconto > 0 && (
                                <>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500 font-medium">Subtotal</span>
                                        <span className="font-semibold text-gray-700">{formatCurrency(reciboAtual.total + reciboAtual.desconto)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-amber-600 font-medium flex items-center gap-1.5"><BadgePercent className="w-4 h-4" /> Desconto</span>
                                        <span className="font-bold text-amber-600">- {formatCurrency(reciboAtual.desconto)}</span>
                                    </div>
                                </>
                            )}

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

                            {/* NFC-e — emitindo em segundo plano (a venda já está registrada) */}
                            {emitindoNfceId === reciboAtual.pedidos[0]?.pedidoId
                                && !reciboAtual.pedidos.some((p) => p.nfce) && (
                                <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 flex items-center gap-2 text-sm text-blue-700 font-semibold">
                                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                    Emitindo nota fiscal… a venda já está registrada.
                                </div>
                            )}

                            {/* NFC-e — Status fiscal (uma nota por pedido da conta) */}
                            {reciboAtual.pedidos.some((p) => p.nfce) && (() => {
                                const notasOk = reciboAtual.pedidos.filter((p) => p.nfce?.ok)
                                const notasFalha = reciboAtual.pedidos.filter((p) => p.nfce && !p.nfce.ok)
                                const temOk = notasOk.length > 0
                                const temFalha = notasFalha.length > 0
                                return (
                                    <div className="space-y-2">
                                        {temOk && (
                                            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 space-y-1.5">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                                                        <Receipt className="w-4 h-4" /> {notasOk.length > 1 ? `${notasOk.length} NFC-e emitidas` : 'NFC-e emitida'}
                                                    </span>
                                                </div>
                                                {notasOk.map((p) => p.nfce?.chaveAcesso && (
                                                    <p key={p.pedidoId} className="text-[10px] font-mono text-emerald-700/80 break-all">
                                                        {p.nfce.chaveAcesso}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                        {temFalha && (
                                            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-1.5">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-amber-700 font-semibold flex items-center gap-1.5">
                                                        <AlertTriangle className="w-4 h-4" /> {notasFalha.length > 1 ? `${notasFalha.length} NFC-e pendentes` : 'NFC-e pendente'}
                                                    </span>
                                                    <button
                                                        onClick={handleReemitirNFCe}
                                                        className="text-xs font-bold text-amber-700 hover:underline"
                                                    >
                                                        Tentar novamente
                                                    </button>
                                                </div>
                                                <p className="text-[11px] text-amber-700/70">
                                                    A venda foi registrada normalmente. {notasFalha.length > 1 ? 'Algumas notas não foram emitidas' : 'Apenas a NFC-e não foi emitida'}.
                                                </p>
                                            </div>
                                        )}
                                        {/* Status da impressão automática — deixa a falha VISÍVEL */}
                                        {temOk && impressora.conectada && statusImpressao === 'falha' && (
                                            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 font-semibold flex items-center gap-1.5">
                                                <AlertTriangle className="w-4 h-4 shrink-0" /> O cupom não saiu na impressora. Toque em &quot;Reimprimir&quot; abaixo.
                                            </div>
                                        )}
                                        {temOk && impressora.conectada && statusImpressao === 'ok' && (
                                            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700 font-semibold flex items-center gap-1.5">
                                                <CheckCircle2 className="w-4 h-4 shrink-0" /> Cupom impresso.
                                            </div>
                                        )}
                                        {temOk && impressora.suportado && !impressora.conectada && (
                                            <div className="space-y-2">
                                                <button
                                                    onClick={impressora.parear}
                                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-sm transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
                                                >
                                                    <Printer className="w-5 h-5" />
                                                    Conectar Impressora (USB)
                                                </button>
                                                <button
                                                    onClick={impressora.pearSerial}
                                                    className="w-full py-2.5 bg-white border-2 border-blue-400 text-blue-700 hover:bg-blue-50 rounded-xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                                >
                                                    <Printer className="w-4 h-4" />
                                                    Tentar via Porta Serial (COM)
                                                </button>
                                                <p className="text-[10px] text-gray-500 text-center">
                                                    Se USB der &quot;Access Denied&quot;, use a opcao Porta Serial.
                                                </p>
                                            </div>
                                        )}
                                        {temOk && impressora.conectada && (
                                            <button
                                                onClick={reimprimirReciboManual}
                                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-sm transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
                                            >
                                                <Printer className="w-5 h-5" />
                                                {notasOk.length > 1 ? 'Reimprimir Cupons' : 'Reimprimir Cupom'}
                                            </button>
                                        )}
                                        {temOk && !impressora.suportado && (
                                            <button
                                                onClick={() => window.print()}
                                                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-sm transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
                                            >
                                                <Printer className="w-5 h-5" />
                                                Imprimir Cupom Fiscal
                                            </button>
                                        )}
                                    </div>
                                )
                            })()}
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

            {/* ── Modal Fechamento de Caixa ── */}
            {modalFechamento && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <div className="px-6 pt-5 pb-4 bg-gradient-to-br from-gray-800 to-gray-900 text-white flex items-center justify-between sticky top-0">
                            <div className="flex items-center gap-2">
                                <Lock className="w-5 h-5" />
                                <h2 className="text-base font-bold">Fechar Caixa</h2>
                            </div>
                            <button
                                onClick={fecharModalFechamento}
                                disabled={processandoFechamento}
                                className="p-1 text-white/70 hover:text-white rounded"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {carregandoResumo || !resumoFechamento ? (
                            <div className="flex flex-col items-center justify-center gap-2 p-10 text-gray-400">
                                <RefreshCw className="w-6 h-6 animate-spin" />
                                <p className="text-sm">Calculando resumo do turno…</p>
                            </div>
                        ) : (
                            <div className="p-5 space-y-4">
                                {/* Resumo Vendas */}
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Resumo do Turno</p>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Fundo de troco</span>
                                        <span className="font-semibold text-gray-800">{formatCurrency(resumoFechamento.abertura_valor)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Vendas ({resumoFechamento.qtd_vendas})</span>
                                        <span className="font-semibold text-gray-800">{formatCurrency(resumoFechamento.total_vendas)}</span>
                                    </div>
                                    <div className="border-t border-dashed border-gray-200 my-1.5" />
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500 flex items-center gap-1"><Banknote className="w-3 h-3" /> Dinheiro</span>
                                        <span className="font-medium text-gray-700">{formatCurrency(resumoFechamento.total_dinheiro)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500 flex items-center gap-1"><Smartphone className="w-3 h-3" /> PIX</span>
                                        <span className="font-medium text-gray-700">{formatCurrency(resumoFechamento.total_pix)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Débito</span>
                                        <span className="font-medium text-gray-700">{formatCurrency(resumoFechamento.total_debito)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-500 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Crédito</span>
                                        <span className="font-medium text-gray-700">{formatCurrency(resumoFechamento.total_credito)}</span>
                                    </div>
                                    <div className="border-t border-dashed border-gray-200 my-1.5" />
                                    <div className="flex justify-between text-xs">
                                        <span className="text-red-600 flex items-center gap-1"><ArrowDownCircle className="w-3 h-3" /> Sangrias</span>
                                        <span className="font-medium text-red-600">- {formatCurrency(resumoFechamento.total_sangrias)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-emerald-600 flex items-center gap-1"><ArrowUpCircle className="w-3 h-3" /> Reforços</span>
                                        <span className="font-medium text-emerald-600">+ {formatCurrency(resumoFechamento.total_reforcos)}</span>
                                    </div>
                                </div>

                                {/* Saldo esperado em dinheiro */}
                                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Esperado em dinheiro</p>
                                        <p className="text-[10px] text-blue-500">Fundo + vendas dinheiro − sangrias + reforços</p>
                                    </div>
                                    <p className="text-xl font-black text-blue-700">{formatCurrency(resumoFechamento.saldo_esperado_dinheiro)}</p>
                                </div>

                                {/* Valor contado */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                                        Valor contado em dinheiro
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">R$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0,00"
                                            value={valorContado}
                                            onChange={(e) => setValorContado(e.target.value)}
                                            className="w-full pl-10 pr-3 py-2.5 border-2 border-gray-200 focus:border-gray-700 rounded-xl text-base font-bold outline-none transition-colors"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {/* Diferença em tempo real */}
                                {valorContado !== '' && !isNaN(parseFloat(valorContado.replace(',', '.'))) && (() => {
                                    const contado = parseFloat(valorContado.replace(',', '.'))
                                    const dif = contado - resumoFechamento.saldo_esperado_dinheiro
                                    if (dif === 0) {
                                        return (
                                            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-xl">
                                                <span className="text-sm font-bold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Confere</span>
                                                <span className="text-sm font-bold text-emerald-700">R$ 0,00</span>
                                            </div>
                                        )
                                    }
                                    const sobra = dif > 0
                                    return (
                                        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${sobra ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                            <span className="text-sm font-bold flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4" /> {sobra ? 'Sobra' : 'Falta'}
                                            </span>
                                            <span className="text-sm font-bold">{formatCurrency(Math.abs(dif))}</span>
                                        </div>
                                    )
                                })()}

                                {/* Observação */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                                        Observação (opcional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ex: Conferido com Bugra, troco repassado…"
                                        value={obsFechamento}
                                        onChange={(e) => setObsFechamento(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-200 outline-none"
                                    />
                                </div>

                                {/* Imprimir comprovante? (opcional — sai automatico ao confirmar) */}
                                <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-xl border border-gray-200 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={imprimirComprovante}
                                        onChange={(e) => setImprimirComprovante(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-gray-800 focus:ring-2 focus:ring-gray-400"
                                    />
                                    <span className="flex flex-col">
                                        <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                                            <Printer className="w-4 h-4 text-gray-500" />
                                            Imprimir comprovante de fechamento
                                        </span>
                                        <span className="text-[11px] text-gray-400">
                                            {imprimirComprovante
                                                ? (impressora.conectada
                                                    ? 'Sai automaticamente na impressora ao confirmar.'
                                                    : 'Impressora não conectada — não será impresso.')
                                                : 'O fechamento será registrado sem imprimir.'}
                                        </span>
                                    </span>
                                </label>

                                <button
                                    onClick={handleFecharCaixa}
                                    disabled={processandoFechamento || valorContado === ''}
                                    className="w-full py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl font-extrabold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {processandoFechamento ? (
                                        <><RefreshCw className="w-4 h-4 animate-spin" /> Fechando…</>
                                    ) : (
                                        <><Lock className="w-4 h-4" /> Confirmar Fechamento</>
                                    )}
                                </button>
                                <p className="text-[10px] text-gray-400 text-center">
                                    Após fechar, será preciso abrir um novo caixa para registrar vendas.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Modal PIX ── */}
            {modalPix && contaSelecionada && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in-0 zoom-in-95 text-center">
                        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                            <h2 className="text-lg font-bold flex items-center justify-center gap-2">
                                <Smartphone className="w-5 h-5" /> Pagamento via PIX
                            </h2>
                            <p className="text-emerald-100 text-sm mt-1">Aguardando pagamento do cliente</p>
                        </div>
                        <div className="p-6 flex flex-col items-center">
                            {(() => {
                                const pixPayload = gerarPixCopiaECola({
                                    valor: totalLiquidoConta,
                                    txid: contaSelecionada.pedidos[0]?.id?.replace(/-/g, '').slice(0, 25),
                                })
                                return (
                                    <>
                                        <div className="bg-white p-3 rounded-xl border-2 border-emerald-100 shadow-sm mb-4 inline-block">
                                            <QRCodeSVG
                                                value={pixPayload}
                                                size={180}
                                                level="M"
                                                includeMargin={false}
                                            />
                                        </div>
                                        <p className="text-sm text-gray-500 mb-1">Total a Pagar</p>
                                        <p className="text-3xl font-black text-gray-900 mb-1">{formatCurrency(totalLiquidoConta)}</p>
                                        {descontoAplicado > 0 && (
                                            <p className="text-xs text-amber-600 font-semibold mb-1">desconto de {formatCurrency(descontoAplicado)} aplicado</p>
                                        )}
                                        <p className="text-xs text-gray-400 mb-4">{PIX_RECEBEDOR.nome}</p>

                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    await navigator.clipboard.writeText(pixPayload)
                                                    toast.success('Código PIX copiado!')
                                                } catch {
                                                    toast.error('Não foi possível copiar o código.')
                                                }
                                            }}
                                            className="w-full mb-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700
                                                       rounded-xl font-bold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                        >
                                            <Copy className="w-4 h-4" />
                                            Copiar código (Pix Copia e Cola)
                                        </button>
                                    </>
                                )
                            })()}

                            {/* Pagamento confirmado: a nota é SEMPRE emitida à SEFAZ;
                                o operador escolhe apenas o que sai em papel. */}
                            <div className="w-full space-y-3">
                                <SeletorImpressao
                                    value={opcaoImpressao}
                                    onChange={setOpcaoImpressao}
                                    disabled={processandoVenda}
                                />
                                <button
                                    onClick={() => handleFinalizarVenda(opcaoImpressao)}
                                    disabled={processandoVenda}
                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40"
                                >
                                    {processandoVenda ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    Confirmar Pagamento
                                </button>
                                <button
                                    onClick={() => setModalPix(false)}
                                    disabled={processandoVenda}
                                    className="w-full py-2 text-gray-500 hover:text-gray-700 rounded-xl font-semibold text-xs transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal de Desconto ── */}
            {modalDesconto && contaSelecionada && (
                <DescontoModal
                    totalBruto={totalBrutoConta}
                    descontoAtual={descontoAplicado}
                    onAplicar={(d) => setDescontoConta(d)}
                    onClose={() => setModalDesconto(false)}
                />
            )}

            {/* ── Modal de Cancelamento (conta inteira OU itens) com senha do ADM ── */}
            {modalCancelar && contaSelecionada && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between px-5 py-4 bg-red-600 text-white shrink-0">
                            <div className="flex items-center gap-2">
                                <Ban className="w-5 h-5" />
                                <h3 className="font-extrabold">Cancelar · {contaSelecionada.label}</h3>
                            </div>
                            <button
                                onClick={() => setModalCancelar(false)}
                                disabled={processandoCancelamento}
                                className="p-1 hover:bg-white/20 rounded-lg disabled:opacity-50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4 overflow-y-auto">
                            {/* Escolha do que cancelar */}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setModoCancelamento('conta')}
                                    className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${modoCancelamento === 'conta' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Conta inteira
                                </button>
                                <button
                                    onClick={() => setModoCancelamento('itens')}
                                    className={`py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${modoCancelamento === 'itens' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Itens específicos
                                </button>
                            </div>

                            {modoCancelamento === 'conta' ? (
                                <p className="text-sm text-gray-600">
                                    {contaSelecionada.pedidos.length > 1
                                        ? `Os ${contaSelecionada.pedidos.length} pedidos da conta serão cancelados`
                                        : 'O pedido será cancelado'} e sairão do caixa. Os relatórios não os contabilizam.
                                </p>
                            ) : (
                                <div className="space-y-1.5">
                                    <p className="text-xs text-gray-500">Marque os itens que devem ser cancelados:</p>
                                    <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-52 overflow-y-auto">
                                        {contaSelecionada.pedidos.flatMap((pedido) =>
                                            pedido.itens_pedido.map((item) => {
                                                const marcado = itensParaCancelar.has(item.id)
                                                return (
                                                    <label key={item.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                                                        <input
                                                            type="checkbox"
                                                            checked={marcado}
                                                            onChange={() => toggleItemCancelar(item.id)}
                                                            className="w-4 h-4 accent-red-600"
                                                        />
                                                        <span className="flex-1 text-sm text-gray-800">
                                                            {item.quantidade}× {item.produto?.nome ?? 'Produto'}
                                                        </span>
                                                        <span className="text-sm font-semibold text-gray-600">
                                                            {formatCurrency(item.subtotal)}
                                                        </span>
                                                    </label>
                                                )
                                            })
                                        )}
                                    </div>
                                    {itensParaCancelar.size > 0 && (
                                        <p className="text-xs text-gray-500">{itensParaCancelar.size} item(ns) marcado(s).</p>
                                    )}
                                </div>
                            )}

                            {/* Senha do ADM (campo simples; o caixa nunca vê a senha) */}
                            <div className="space-y-1.5">
                                <p className="text-xs text-gray-500">
                                    O cancelamento exige a <strong>senha de exclusão</strong> do administrador.
                                </p>
                                <div className="relative">
                                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type={revelarSenhaCancel ? 'text' : 'password'}
                                        value={senhaCancelamento}
                                        onChange={(e) => setSenhaCancelamento(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && confirmarCancelamento()}
                                        placeholder="Senha de exclusão"
                                        autoFocus
                                        autoComplete="off"
                                        className="w-full pl-9 pr-10 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setRevelarSenhaCancel((v) => !v)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                                        title={revelarSenhaCancel ? 'Ocultar' : 'Mostrar'}
                                    >
                                        {revelarSenhaCancel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 shrink-0">
                            <button
                                onClick={() => setModalCancelar(false)}
                                disabled={processandoCancelamento}
                                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm disabled:opacity-50"
                            >
                                Voltar
                            </button>
                            <button
                                onClick={confirmarCancelamento}
                                disabled={processandoCancelamento}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                {processandoCancelamento ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Layout Principal ──
                 Desktop (lg+): split-screen tela cheia com scroll independente em cada lado.
                 Mobile: container cresce com o conteúdo e o body rola, garantindo que os
                 botões de forma de pagamento e Finalizar Venda fiquem sempre alcançáveis. */}
            <div className="flex flex-col min-h-[calc(100vh-theme(spacing.16)-theme(spacing.12))] lg:h-[calc(100vh-theme(spacing.16)-theme(spacing.12))] gap-0 -m-3 sm:-m-4 lg:-m-6">

                {/* Header do Caixa */}
                <header className="flex items-center justify-between gap-2 flex-wrap px-3 sm:px-6 py-3 bg-white border-b border-blue-100 shrink-0">
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
                                onClick={abrirModalFechamento}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gray-800 hover:bg-gray-900 border border-gray-800 rounded-lg transition-colors"
                                title="Fechar caixa manualmente (conferência)"
                            >
                                <Lock className="w-3.5 h-3.5" />
                                Fechar Caixa
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
                <div className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden">

                    {/* ════ LADO ESQUERDO: Lista de Pedidos Prontos ════ */}
                    <div className="flex flex-col w-full lg:w-[340px] xl:w-[380px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-blue-50 bg-white overflow-hidden max-h-[45vh] lg:max-h-none">
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
                                {contasFiltradas.length}
                            </span>
                        </div>

                        {/* Lista (uma linha por CONTA — pedidos da mesma mesa unificados) */}
                        <div className="flex-1 overflow-y-auto space-y-1 px-2 pb-2">
                            {contasFiltradas.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-300">
                                    <CheckCircle2 className="w-10 h-10" />
                                    <p className="text-sm font-medium">Nenhum pedido pronto</p>
                                    <p className="text-xs text-center">Os pedidos marcados como prontos<br />na cozinha aparecerão aqui</p>
                                </div>
                            ) : (
                                contasFiltradas.map((conta) => {
                                    const selecionada = contaSelecionadaKey === conta.key
                                    const temMesaOuComanda = conta.numeroMesa != null || conta.comandaNumero != null
                                    const nPedidos = conta.pedidos.length
                                    const nItens = conta.itens.length
                                    return (
                                        <button
                                            key={conta.key}
                                            onClick={() => {
                                                setContaSelecionadaKey(conta.key)
                                                setFormaPagamento('dinheiro')
                                                setValorRecebido('')
                                            }}
                                            className={`w-full text-left p-3 rounded-xl border transition-all ${selecionada
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                                : 'bg-white border-gray-100 hover:border-blue-200 hover:bg-blue-50/40'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${selecionada ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>
                                                        {temMesaOuComanda ? (
                                                            <Hash className="w-3.5 h-3.5" />
                                                        ) : (
                                                            <User className="w-3.5 h-3.5" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className={`text-sm font-bold leading-none flex items-center gap-1.5 ${selecionada ? 'text-white' : 'text-gray-800'}`}>
                                                            {conta.label}
                                                            {nPedidos > 1 && (
                                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${selecionada ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>
                                                                    {nPedidos} pedidos
                                                                </span>
                                                            )}
                                                        </p>
                                                        <p className={`text-xs mt-0.5 flex items-center gap-1 ${selecionada ? 'text-blue-200' : 'text-gray-400'}`}>
                                                            <Clock className="w-3 h-3" />
                                                            {tempoDecorrido(conta.createdAt)}
                                                            {' · '}
                                                            {nItens} iten{nItens !== 1 ? 's' : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`text-sm font-extrabold ${selecionada ? 'text-white' : 'text-blue-700'}`}>
                                                        {formatCurrency(conta.total)}
                                                    </span>
                                                    <ChevronRight className={`w-4 h-4 ${selecionada ? 'text-blue-200' : 'text-gray-300'}`} />
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* ════ LADO DIREITO: Detalhes da Conta ════ */}
                    <div className="flex-1 flex flex-col bg-gray-50/50 lg:overflow-hidden">
                        {!contaSelecionada ? (
                            /* Estado vazio */
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-300 p-8">
                                <Receipt className="w-16 h-16" />
                                <p className="text-lg font-semibold">Selecione uma conta</p>
                                <p className="text-sm text-center">
                                    Escolha uma conta na lista para<br />visualizar os itens e realizar o pagamento.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col lg:h-full lg:overflow-y-auto">

                                {/* Cabeçalho da Conta — fixo no topo ao rolar (desktop) */}
                                <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-blue-50 shrink-0 lg:sticky lg:top-0 lg:z-10">
                                    <div>
                                        <h2 className="font-extrabold text-gray-900 text-base flex items-center gap-2">
                                            {contaSelecionada.label}
                                            {contaSelecionada.pedidos.length > 1 && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                    {contaSelecionada.pedidos.length} pedidos
                                                </span>
                                            )}
                                        </h2>
                                        <p className="text-xs text-gray-400 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Aguardando há {tempoDecorrido(contaSelecionada.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={abrirModalCancelar}
                                            disabled={processandoCancelamento}
                                            className="px-2.5 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                                        >
                                            {processandoCancelamento ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                            {contaSelecionada.pedidos.length > 1 ? 'Cancelar Conta' : 'Cancelar Pedido'}
                                        </button>
                                        <button
                                            onClick={() => setContaSelecionadaKey(null)}
                                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Itens da Conta — combinados de todos os pedidos da mesa/comanda.
                                    Cresce com o conteúdo; a coluna inteira rola, então a lista nunca
                                    é espremida a "uma linha". */}
                                <div className="flex-1 p-4 space-y-1.5">
                                    {contaSelecionada.itens.map((item) => (
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

                                {/* Painel de Pagamento — NÃO fixo: a coluna inteira rola, então a
                                    lista de itens acima ocupa a altura real (antes o sticky daqui
                                    espremia os itens a uma "janelinha"). shrink-0 evita compressão. */}
                                <div className="bg-white border-t border-blue-100 p-4 space-y-3.5 shrink-0">
                                    {/* Totais + Desconto */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-gray-500">
                                                {descontoAplicado > 0 ? 'Subtotal' : 'Total da Conta'}
                                            </span>
                                            <span className={descontoAplicado > 0
                                                ? 'text-base font-bold text-gray-400 line-through'
                                                : 'text-2xl font-black text-gray-900'}>
                                                {formatCurrency(totalBrutoConta)}
                                            </span>
                                        </div>

                                        {descontoAplicado > 0 && (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-medium text-amber-600 flex items-center gap-1.5">
                                                        <BadgePercent className="w-4 h-4" /> Desconto
                                                    </span>
                                                    <span className="text-sm font-bold text-amber-600">- {formatCurrency(descontoAplicado)}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-700">Total a pagar</span>
                                                    <span className="text-2xl font-black text-emerald-600">{formatCurrency(totalLiquidoConta)}</span>
                                                </div>
                                            </>
                                        )}

                                        {/* Botão de desconto — sempre acessível, destacado quando aplicado */}
                                        <button
                                            onClick={() => setModalDesconto(true)}
                                            className={`w-full py-2.5 rounded-xl border-2 border-dashed text-sm font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-[0.99] ${descontoAplicado > 0
                                                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                                : 'border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600'}`}
                                        >
                                            <BadgePercent className="w-4 h-4" />
                                            {descontoAplicado > 0
                                                ? `Desconto aplicado: ${formatCurrency(descontoAplicado)} · alterar`
                                                : 'Aplicar desconto'}
                                        </button>
                                    </div>

                                    {/* CPF na nota (opcional) — antes da forma de pagamento */}
                                    <CpfNotaInput
                                        value={cpfNota}
                                        onChange={setCpfNota}
                                        cpfInicial={contaSelecionada.clienteCpf}
                                    />

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
                                                    className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border-2 text-xs font-bold transition-all active:scale-95 ${formaPagamento === value
                                                        ? FORMA_STYLE[value].active
                                                        : FORMA_STYLE[value].inactive
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
                                                        min={totalLiquidoConta}
                                                        step="0.01"
                                                        placeholder={totalLiquidoConta.toFixed(2)}
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

                                    {/* Finalizar — a nota é SEMPRE emitida à SEFAZ; o
                                        seletor "O que imprimir?" controla só o papel. */}
                                    {(() => {
                                        const bloqueado =
                                            processandoVenda ||
                                            !aberturaHoje ||
                                            (formaPagamento === 'dinheiro' && valorRecebidoNum < totalLiquidoConta)
                                        if (formaPagamento === 'pix') {
                                            return (
                                                <button
                                                    onClick={() => setModalPix(true)}
                                                    disabled={bloqueado}
                                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl font-extrabold text-base transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                                                >
                                                    {processandoVenda
                                                        ? (<><RefreshCw className="w-5 h-5 animate-spin" /> Processando...</>)
                                                        : (<><Smartphone className="w-5 h-5" /> Gerar QR Code PIX</>)}
                                                </button>
                                            )
                                        }
                                        return (
                                            <div className="space-y-3">
                                                <SeletorImpressao
                                                    value={opcaoImpressao}
                                                    onChange={setOpcaoImpressao}
                                                    disabled={bloqueado}
                                                />
                                                <button
                                                    onClick={() => handleFinalizarVenda(opcaoImpressao)}
                                                    disabled={bloqueado}
                                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-2xl font-extrabold text-base transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                                                >
                                                    {processandoVenda
                                                        ? (<><RefreshCw className="w-5 h-5 animate-spin" /> Processando...</>)
                                                        : (<><CheckCircle2 className="w-5 h-5" /> Finalizar Venda</>)}
                                                </button>
                                            </div>
                                        )
                                    })()}

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
