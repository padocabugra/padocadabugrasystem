'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import { toast } from 'sonner'
import {
    X, Loader2, Clock, MapPin, Truck, Trash2, Plus, Minus,
    Pencil, Ban, Save, Search, ShoppingCart, Lock, KeyRound, Eye, EyeOff, Printer,
} from 'lucide-react'
import { useThermalPrinter } from '@/components/shared/ThermalPrinterContext'

// Rótulos das formas de pagamento (espelha o Caixa) — usado na reimpressão.
const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
    dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Cartão Débito', credito: 'Cartão Crédito', voucher: 'Voucher',
}

interface ItemEdit {
    id?: string
    produto_id: string
    nome: string
    preco: number
    quantidade: number
    unidade_medida?: string | null
    codigo?: string | null
}

interface ProdutoOpt {
    id: string
    nome: string
    preco: number
    unidade_medida?: string | null
}

const STATUS_LABEL: Record<string, string> = {
    pendente: 'Pendente', preparando: 'Preparando', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado',
}

export default function PedidoDetalheModal({
    pedidoId, onClose, onChanged,
}: {
    pedidoId: string
    onClose: () => void
    onChanged: () => void
}) {
    const supabase = createClient()
    const impressora = useThermalPrinter()
    const [loading, setLoading] = useState(true)
    const [reimprimindo, setReimprimindo] = useState(false)
    const [reimprimindoNota, setReimprimindoNota] = useState(false)
    const [pedido, setPedido] = useState<any | null>(null)
    const [itens, setItens] = useState<ItemEdit[]>([])
    const [editMode, setEditMode] = useState(false)
    const [editItens, setEditItens] = useState<ItemEdit[]>([])
    const [processando, setProcessando] = useState(false)

    // Picker de produtos (lazy)
    const [showPicker, setShowPicker] = useState(false)
    const [produtos, setProdutos] = useState<ProdutoOpt[]>([])
    const [buscaProduto, setBuscaProduto] = useState('')

    // Cancelamento protegido por senha de exclusão do ADM
    const [senhaModal, setSenhaModal] = useState(false)
    const [senhaExclusao, setSenhaExclusao] = useState('')
    const [revelarSenha, setRevelarSenha] = useState(false)
    const [verificandoSenha, setVerificandoSenha] = useState(false)

    const carregar = useCallback(async () => {
        setLoading(true)
        const { data } = await supabase
            .from('pedidos')
            .select(`
                id, numero_mesa, comanda_id, total, desconto, status, tipo_pedido, forma_pagamento, created_at,
                chave_nfce, qrcode_nfce, nfce_status, observacoes, destino_cozinha, destino_cafeteria,
                cliente:clientes ( nome ),
                comanda:comandas!pedidos_comanda_id_fkey ( numero ),
                itens_pedido (
                    id, quantidade, preco_unitario,
                    produto:produtos ( id, nome, preco, unidade_medida, codigo )
                )
            `)
            .eq('id', pedidoId)
            .single()
        if (data) {
            setPedido(data)
            const its: ItemEdit[] = (data.itens_pedido ?? []).map((i: any) => {
                const prod = Array.isArray(i.produto) ? i.produto[0] : i.produto
                return {
                    id: i.id,
                    produto_id: prod?.id ?? '',
                    nome: prod?.nome ?? 'Produto',
                    preco: Number(i.preco_unitario),
                    quantidade: Number(i.quantidade),
                    unidade_medida: prod?.unidade_medida ?? 'un',
                    codigo: prod?.codigo ?? null,
                }
            })
            setItens(its)
        }
        setLoading(false)
    }, [supabase, pedidoId])

    useEffect(() => { carregar() }, [carregar])

    const ativo = pedido && ['pendente', 'preparando', 'pronto'].includes(pedido.status)

    const totalEdit = editItens.reduce((s, i) => s + i.preco * i.quantidade, 0)

    function entrarEdicao() {
        setEditItens(itens.map((i) => ({ ...i })))
        setEditMode(true)
    }

    async function abrirPicker() {
        setShowPicker(true)
        if (produtos.length === 0) {
            const { data } = await supabase
                .from('produtos')
                .select('id, nome, preco, unidade_medida')
                .eq('disponivel_venda', true)
                .order('nome')
            // Edição rápida: só itens por unidade (kg exige pesagem — não tratado aqui)
            setProdutos(((data ?? []) as any[]).filter((p) => (p.unidade_medida ?? 'un').toLowerCase() !== 'kg'))
        }
    }

    function addProduto(p: ProdutoOpt) {
        setEditItens((prev) => {
            const ex = prev.find((i) => i.produto_id === p.id)
            if (ex) return prev.map((i) => i.produto_id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i)
            return [...prev, { produto_id: p.id, nome: p.nome, preco: Number(p.preco), quantidade: 1, unidade_medida: p.unidade_medida ?? 'un' }]
        })
    }

    function mudarQtd(idx: number, delta: number) {
        setEditItens((prev) => prev.flatMap((i, k) => {
            if (k !== idx) return [i]
            const nova = i.quantidade + delta
            return nova <= 0 ? [] : [{ ...i, quantidade: nova }]
        }))
    }

    function removerItem(idx: number) {
        setEditItens((prev) => prev.filter((_, k) => k !== idx))
    }

    async function salvarEdicao() {
        if (editItens.length === 0) {
            toast.error('O pedido precisa ter pelo menos 1 item. Para zerar, cancele o pedido.')
            return
        }
        setProcessando(true)
        try {
            // Sincroniza itens: remove os atuais e reinsere (subtotal é coluna gerada/derivada).
            const { error: delErr } = await supabase.from('itens_pedido').delete().eq('pedido_id', pedidoId)
            if (delErr) throw delErr
            const rows = editItens.map((i) => ({
                pedido_id: pedidoId,
                produto_id: i.produto_id,
                quantidade: i.quantidade,
                preco_unitario: i.preco,
            }))
            const { error: insErr } = await supabase.from('itens_pedido').insert(rows)
            if (insErr) throw insErr
            const { error: upErr } = await supabase.from('pedidos').update({ total: totalEdit }).eq('id', pedidoId)
            if (upErr) throw upErr

            toast.success('Pedido atualizado!')
            setEditMode(false)
            setShowPicker(false)
            await carregar()
            onChanged()
        } catch (err: any) {
            toast.error('Erro ao salvar', { description: err?.message })
        } finally {
            setProcessando(false)
        }
    }

    // Abre o modal que pede a senha de exclusão do ADM (aprovação obrigatória).
    function solicitarCancelamento() {
        setSenhaExclusao('')
        setRevelarSenha(false)
        setSenhaModal(true)
    }

    // Valida a senha do ADM via RPC e, se conferir, cancela o pedido.
    async function confirmarCancelamento() {
        if (!senhaExclusao.trim()) {
            toast.error('Informe a senha de exclusão do administrador.')
            return
        }
        setVerificandoSenha(true)
        try {
            const { data: ok, error: errSenha } = await supabase.rpc('fn_verificar_senha_exclusao', {
                p_senha: senhaExclusao.trim(),
            })
            if (errSenha) throw errSenha
            if (ok !== true) {
                toast.error('Senha incorreta ou não configurada pelo administrador.')
                return
            }

            const { error } = await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', pedidoId)
            if (error) { toast.error('Erro ao cancelar', { description: error.message }); return }

            toast.success('Pedido cancelado')
            setSenhaModal(false)
            onChanged()
            onClose()
        } catch (err: any) {
            toast.error('Erro ao validar a senha', { description: err?.message })
        } finally {
            setVerificandoSenha(false)
        }
    }

    // Reimpressão do cupom fiscal de uma venda passada (anti-falha de impressão).
    // Reconstrói o DANFE a partir da chave já emitida + itens do pedido.
    async function reimprimirCupom() {
        if (!pedido?.chave_nfce) {
            toast.error('Este pedido não tem NFC-e emitida para reimprimir.')
            return
        }
        if (!impressora.suportado) {
            toast.warning('Impressão térmica indisponível', { description: 'Abra o sistema no Chrome/Edge do PDV.' })
            return
        }
        if (!impressora.conectada) {
            toast.warning('Impressora não conectada', { description: 'Conecte a impressora no Caixa/PDV e tente de novo.' })
            return
        }
        setReimprimindo(true)
        try {
            const ok = await impressora.imprimir({
                razaoSocial: process.env.NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL || 'BUGRA LTDA',
                cnpj: process.env.NEXT_PUBLIC_EMPRESA_CNPJ || '',
                inscricaoEstadual: process.env.NEXT_PUBLIC_EMPRESA_IE,
                endereco: process.env.NEXT_PUBLIC_EMPRESA_ENDERECO,
                chaveAcesso: pedido.chave_nfce,
                qrCodeUrl: pedido.qrcode_nfce ?? undefined,
                itens: itens.map((i) => ({
                    quantidade: i.quantidade,
                    precoUnitario: i.preco,
                    subtotal: i.preco * i.quantidade,
                    nome: i.nome,
                    codigo: i.codigo ?? null,
                })),
                total: Number(pedido.total),
                desconto: Number(pedido.desconto) || 0,
                valorPago: Number(pedido.total),
                troco: 0,
                formaPagamentoLabel: FORMA_PAGAMENTO_LABEL[pedido.forma_pagamento] ?? (pedido.forma_pagamento || '—'),
                dataHora: new Date(pedido.created_at).toLocaleString('pt-BR'),
            })
            if (ok) toast.success('Cupom reimpresso com sucesso')
        } finally {
            setReimprimindo(false)
        }
    }

    // Reimpressão da NOTA DE PEDIDO (comanda/comprovante não-fiscal) de uma venda.
    // Reconstrói a nota a partir do pedido + itens. Funciona análogo ao cupom.
    async function reimprimirNotaPedido() {
        if (!pedido) return
        if (!impressora.suportado) {
            toast.warning('Impressão térmica indisponível', { description: 'Abra o sistema no Chrome/Edge do PDV.' })
            return
        }
        if (!impressora.conectada) {
            toast.warning('Impressora não conectada', { description: 'Conecte a impressora no Caixa/PDV e tente de novo.' })
            return
        }
        const cmd = Array.isArray(pedido.comanda) ? pedido.comanda[0]?.numero : pedido.comanda?.numero
        const cli = (Array.isArray(pedido.cliente) ? pedido.cliente[0]?.nome : pedido.cliente?.nome) ?? null
        const destino = pedido.destino_cozinha ? 'COZINHA' : pedido.destino_cafeteria ? 'CAFETERIA' : 'CAIXA'
        setReimprimindoNota(true)
        try {
            const ok = await impressora.imprimirComprovantePedido({
                razaoSocial: process.env.NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL || 'BUGRA LTDA',
                cnpj: process.env.NEXT_PUBLIC_EMPRESA_CNPJ || '',
                tipoPedido: pedido.tipo_pedido || 'local',
                destino,
                numeroMesa: pedido.numero_mesa ?? null,
                comandaNumero: cmd ?? null,
                clienteNome: cli,
                itens: itens.map((i) => ({
                    quantidade: i.quantidade,
                    precoUnitario: i.preco,
                    subtotal: i.preco * i.quantidade,
                    nome: i.nome,
                    unidadeMedida: i.unidade_medida ?? null,
                })),
                total: Number(pedido.total),
                formaPagamentoLabel: FORMA_PAGAMENTO_LABEL[pedido.forma_pagamento] ?? (pedido.forma_pagamento || undefined),
                observacoes: pedido.observacoes ?? null,
                dataHora: new Date(pedido.created_at).toLocaleString('pt-BR'),
            })
            if (ok) toast.success('Nota do pedido reimpressa')
        } finally {
            setReimprimindoNota(false)
        }
    }

    const comandaNumero = Array.isArray(pedido?.comanda) ? pedido?.comanda[0]?.numero : pedido?.comanda?.numero
    const clienteNome = (Array.isArray(pedido?.cliente) ? pedido?.cliente[0]?.nome : pedido?.cliente?.nome) ?? null
    const isDelivery = (pedido?.tipo_pedido || 'local') === 'delivery'
    const produtosFiltrados = produtos.filter((p) => p.nome.toLowerCase().includes(buscaProduto.toLowerCase())).slice(0, 30)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center justify-between shrink-0">
                    <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                            {isDelivery ? <Truck className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                            {loading ? 'Carregando…' : (
                                isDelivery ? 'Delivery'
                                    : pedido?.numero_mesa ? `Mesa ${pedido.numero_mesa}`
                                        : (clienteNome ?? 'Balcão')
                            )}
                            {comandaNumero != null && <span className="text-blue-200 text-sm font-semibold">· CMD {comandaNumero}</span>}
                        </h2>
                        {pedido && (
                            <p className="text-blue-200 text-xs mt-0.5 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                {new Date(pedido.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                {' · '}{STATUS_LABEL[pedido.status] ?? pedido.status}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-1 text-white/70 hover:text-white rounded"><X className="w-5 h-5" /></button>
                </div>

                {/* Corpo */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
                    ) : !editMode ? (
                        <>
                            <div className="space-y-2">
                                {itens.map((i) => (
                                    <div key={i.id} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-blue-600 bg-blue-50 min-w-7 h-7 px-1.5 rounded-lg flex items-center justify-center">
                                                {(i.unidade_medida ?? 'un').toLowerCase() === 'kg' ? `${i.quantidade}kg` : `${i.quantidade}x`}
                                            </span>
                                            <span className="text-gray-700 font-medium">{i.nome}</span>
                                        </div>
                                        <span className="font-bold text-gray-800">{formatCurrency(i.preco * i.quantidade)}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-dashed border-gray-200" />
                            {Number(pedido?.desconto) > 0 && (
                                <>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500 font-medium">Subtotal</span>
                                        <span className="font-semibold text-gray-700">{formatCurrency(Number(pedido?.total ?? 0) + Number(pedido?.desconto ?? 0))}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-amber-600 font-medium">Desconto</span>
                                        <span className="font-bold text-amber-600">- {formatCurrency(Number(pedido?.desconto ?? 0))}</span>
                                    </div>
                                </>
                            )}
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-500">Total</span>
                                <span className="text-xl font-black text-gray-900">{formatCurrency(Number(pedido?.total ?? 0))}</span>
                            </div>
                            {pedido?.forma_pagamento && (
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500 font-medium">Pagamento</span>
                                    <span className="font-bold text-gray-800">{pedido.forma_pagamento}</span>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Edição de itens */}
                            <div className="space-y-2">
                                {editItens.map((i, idx) => {
                                    const isKg = (i.unidade_medida ?? 'un').toLowerCase() === 'kg'
                                    return (
                                        <div key={idx} className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-800 truncate">{i.nome}</p>
                                                <p className="text-xs text-gray-500">{formatCurrency(i.preco)} {isKg ? '/kg' : 'un'}</p>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {!isKg && (
                                                    <button onClick={() => mudarQtd(idx, -1)} className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-red-500 active:scale-90">
                                                        <Minus className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <span className="w-9 text-center text-sm font-bold">{isKg ? `${i.quantidade}kg` : i.quantidade}</span>
                                                {!isKg && (
                                                    <button onClick={() => mudarQtd(idx, 1)} className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-blue-600 active:scale-90">
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button onClick={() => removerItem(idx)} className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-500 active:scale-90">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                                {editItens.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Sem itens. Adicione ao menos um.</p>}
                            </div>

                            {!showPicker ? (
                                <button onClick={abrirPicker} className="w-full py-2.5 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-bold flex items-center justify-center gap-2 hover:bg-blue-50">
                                    <Plus className="w-4 h-4" /> Adicionar item
                                </button>
                            ) : (
                                <div className="border border-gray-200 rounded-xl p-2 space-y-2">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            autoFocus
                                            value={buscaProduto}
                                            onChange={(e) => setBuscaProduto(e.target.value)}
                                            placeholder="Buscar produto..."
                                            className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                        />
                                    </div>
                                    <div className="max-h-44 overflow-y-auto space-y-1">
                                        {produtos.length === 0 ? (
                                            <p className="text-xs text-gray-400 text-center py-3"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> carregando…</p>
                                        ) : produtosFiltrados.map((p) => (
                                            <button key={p.id} onClick={() => addProduto(p)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-blue-50 text-left">
                                                <span className="text-sm text-gray-700 truncate">{p.nome}</span>
                                                <span className="text-xs font-bold text-primary shrink-0 ml-2">{formatCurrency(Number(p.preco))}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button onClick={() => setShowPicker(false)} className="w-full text-xs text-gray-500 py-1 hover:text-gray-700">Fechar busca</button>
                                </div>
                            )}

                            <div className="border-t border-dashed border-gray-200" />
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-500">Novo total</span>
                                <span className="text-xl font-black text-gray-900">{formatCurrency(totalEdit)}</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Rodapé com ações */}
                {!loading && (
                    <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-2">
                        {/* Reimpressão da NOTA DE PEDIDO (comanda/comprovante não-fiscal) */}
                        {!editMode && pedido && (
                            <button onClick={reimprimirNotaPedido} disabled={reimprimindoNota}
                                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                                {reimprimindoNota ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                                Reimprimir Nota do Pedido
                            </button>
                        )}
                        {/* Reimpressão do cupom fiscal — disponível p/ qualquer venda com NFC-e */}
                        {!editMode && pedido?.chave_nfce && (
                            <button onClick={reimprimirCupom} disabled={reimprimindo}
                                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                                {reimprimindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                                Reimprimir Cupom Fiscal
                            </button>
                        )}
                        {!editMode ? (
                            ativo ? (
                                <div className="flex gap-2">
                                    <button onClick={solicitarCancelamento} disabled={processando}
                                        className="flex-1 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 font-bold text-sm flex items-center justify-center gap-1.5 hover:bg-red-100 disabled:opacity-50">
                                        <Ban className="w-4 h-4" /> Cancelar Pedido
                                    </button>
                                    <button onClick={entrarEdicao} disabled={processando}
                                        className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                                        <Pencil className="w-4 h-4" /> Editar Itens
                                    </button>
                                </div>
                            ) : (
                                <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm">Fechar</button>
                            )
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={() => { setEditMode(false); setShowPicker(false) }} disabled={processando}
                                    className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm disabled:opacity-50">
                                    Voltar
                                </button>
                                <button onClick={salvarEdicao} disabled={processando}
                                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
                                    {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Sub-modal: senha de exclusão do ADM ── */}
            {senhaModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
                        <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-center gap-2">
                            <Lock className="w-5 h-5 text-red-600" />
                            <h3 className="font-extrabold text-gray-800 text-sm">Autorização do administrador</h3>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-xs text-gray-500">
                                Cancelar o pedido exige a <strong>senha de exclusão</strong> definida pelo administrador.
                            </p>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type={revelarSenha ? 'text' : 'password'}
                                    value={senhaExclusao}
                                    onChange={(e) => setSenhaExclusao(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && confirmarCancelamento()}
                                    placeholder="Senha de exclusão"
                                    autoFocus
                                    autoComplete="off"
                                    className="w-full pl-10 pr-11 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-200 outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setRevelarSenha((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
                                    title={revelarSenha ? 'Ocultar' : 'Mostrar'}
                                >
                                    {revelarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
                            <button
                                onClick={() => setSenhaModal(false)}
                                disabled={verificandoSenha}
                                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm disabled:opacity-50"
                            >
                                Voltar
                            </button>
                            <button
                                onClick={confirmarCancelamento}
                                disabled={verificandoSenha}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                {verificandoSenha ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
