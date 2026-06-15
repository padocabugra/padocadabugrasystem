'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
    Search, AlertTriangle, Package, TrendingDown, Filter,
    Edit2, Plus, ArrowUpCircle, ArrowDownCircle, RefreshCw, ClipboardCheck,
    History, X, Truck, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import { toast } from 'sonner'
import ModalProduto from '@/components/produtos/ModalProduto'
import type { Produto } from '@/lib/types/produto'
import { registrarAuditLog } from '@/lib/audit-log'
import Paginacao, { usePaginacao } from '@/components/shared/Paginacao'

type FiltroEstoque = 'todos' | 'critico' | 'proprio' | 'terceirizado'

// ── Modal de ajuste de estoque rápido ────────────────────────────────────────
function ModalAjuste({
    produto,
    onClose,
    onSuccess,
}: {
    produto: Produto
    onClose: () => void
    onSuccess: () => void
}) {
    const [tipo, setTipo] = useState<'entrada' | 'saida' | 'ajuste'>('entrada')
    const [quantidade, setQuantidade] = useState('')
    const [observacao, setObservacao] = useState('')
    // Dados da compra — só usados quando tipo === 'entrada' (vão pro histórico do produto)
    const [fornecedor, setFornecedor] = useState('')
    const [numeroNF, setNumeroNF] = useState('')
    const [dataCompra, setDataCompra] = useState(() => new Date().toLocaleDateString('en-CA'))
    const [valorTotal, setValorTotal] = useState('')
    const [loading, setLoading] = useState(false)
    const supabase = createClient()

    // Prévia do custo unitário derivado (total pago ÷ quantidade)
    const qtdNum = parseFloat(quantidade.replace(',', '.'))
    const valorNum = parseFloat(valorTotal.replace(',', '.'))
    const unitarioPreview =
        tipo === 'entrada' && valorTotal.trim() && !isNaN(valorNum) && !isNaN(qtdNum) && qtdNum > 0
            ? valorNum / qtdNum
            : null

    async function handleAjuste() {
        const qtd = parseFloat(quantidade.replace(',', '.'))
        if (isNaN(qtd) || qtd <= 0) { toast.error('Informe uma quantidade válida'); return }

        // MED-08: Validação — saída não pode ultrapassar estoque disponível
        const estoqueDisponivel = Number(produto.estoque_atual)
        if (tipo === 'saida' && qtd > estoqueDisponivel) {
            toast.error(`Estoque insuficiente. Disponível: ${estoqueDisponivel} ${produto.unidade_medida}`)
            return
        }

        setLoading(true)
        try {
            const delta = tipo === 'saida' ? -qtd : tipo === 'ajuste' ? qtd - estoqueDisponivel : qtd
            const novoEstoque = tipo === 'ajuste' ? qtd : Math.max(0, estoqueDisponivel + delta)

            // Dados da compra (só na entrada). valor_unitario é derivado do total pago.
            const isEntrada = tipo === 'entrada'
            const valorTotalNum = parseFloat(valorTotal.replace(',', '.'))
            const temValor = isEntrada && valorTotal.trim() !== '' && !isNaN(valorTotalNum) && valorTotalNum >= 0
            const valorUnit = temValor && qtd > 0 ? Number((valorTotalNum / qtd).toFixed(4)) : null

            // Atualiza o saldo; numa entrada com valor, atualiza também o custo (último custo pago)
            const prodUpdate: Record<string, unknown> = {
                estoque_atual: novoEstoque,
                updated_at: new Date().toISOString(),
            }
            if (valorUnit != null) prodUpdate.custo = valorUnit

            const { error: prodErr } = await supabase
                .from('produtos')
                .update(prodUpdate)
                .eq('id', produto.id)
            if (prodErr) throw prodErr

            const movPayload: Record<string, unknown> = {
                produto_id: produto.id,
                tipo,
                quantidade: qtd,
                observacao: observacao || null,
            }
            if (isEntrada) {
                movPayload.numero_nota_fiscal = numeroNF.trim() || null
                movPayload.data_compra = dataCompra || null
                movPayload.fornecedor = fornecedor.trim() || null
                movPayload.valor_total = temValor ? valorTotalNum : null
                movPayload.valor_unitario = valorUnit
            }

            const { error: movErr } = await supabase.from('movimentacao_estoque').insert(movPayload)
            if (movErr) console.error('[ESTOQUE] Falha ao registrar movimentação:', movErr.message)

            registrarAuditLog({
                acao: tipo === 'entrada' ? 'estoque.entrada' : tipo === 'saida' ? 'estoque.saida' : 'estoque.ajuste',
                entidade: 'produtos',
                entidade_id: produto.id,
                detalhes: {
                    produto: produto.nome,
                    tipo,
                    quantidade: qtd,
                    estoqueAnterior: estoqueDisponivel,
                    estoqueNovo: novoEstoque,
                    observacao: observacao || undefined,
                    fornecedor: isEntrada ? (fornecedor.trim() || undefined) : undefined,
                    numeroNotaFiscal: isEntrada ? (numeroNF.trim() || undefined) : undefined,
                    dataCompra: isEntrada ? (dataCompra || undefined) : undefined,
                    valorTotal: temValor ? valorTotalNum : undefined,
                    valorUnitario: valorUnit ?? undefined,
                },
            })

            toast.success('Estoque atualizado com sucesso')
            onSuccess()
            onClose()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro desconhecido'
            toast.error('Erro ao ajustar estoque: ' + msg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800">Ajuste de Estoque</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{produto.nome} · Atual: <strong>{produto.estoque_atual} {produto.unidade_medida}</strong></p>
                </div>
                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                        {(['entrada', 'saida', 'ajuste'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTipo(t)}
                                className={`py-2 rounded-lg text-xs font-semibold capitalize border-2 transition-all ${tipo === t
                                    ? t === 'entrada' ? 'bg-emerald-600 border-emerald-600 text-white'
                                        : t === 'saida' ? 'bg-red-600 border-red-600 text-white'
                                            : 'bg-blue-600 border-blue-600 text-white'
                                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                            >
                                {t === 'entrada' ? '↑ Entrada' : t === 'saida' ? '↓ Saída' : '⇄ Ajuste'}
                            </button>
                        ))}
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            {tipo === 'ajuste' ? 'Novo Saldo' : 'Quantidade'}
                        </label>
                        <div className="relative mt-1">
                            <input
                                type="number"
                                min="0"
                                step="0.001"
                                placeholder="0"
                                value={quantidade}
                                onChange={(e) => setQuantidade(e.target.value)}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-200 outline-none"
                                autoFocus
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                                {produto.unidade_medida}
                            </span>
                        </div>
                    </div>

                    {/* Dados da compra — só na Entrada. Vão pro histórico de compras do produto. */}
                    {tipo === 'entrada' && (
                        <div className="space-y-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/40">
                            <p className="text-[11px] font-semibold text-emerald-800 flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5" />
                                Dados da compra (registra no histórico do produto)
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-600">Fornecedor</label>
                                    <input
                                        type="text"
                                        placeholder="Quem vendeu"
                                        value={fornecedor}
                                        onChange={(e) => setFornecedor(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-200 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600">Nº Nota Fiscal</label>
                                    <input
                                        type="text"
                                        placeholder="Ex: 001234"
                                        value={numeroNF}
                                        onChange={(e) => setNumeroNF(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-200 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600">Data da Compra</label>
                                    <input
                                        type="date"
                                        value={dataCompra}
                                        onChange={(e) => setDataCompra(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-200 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-600">Valor Total Pago (R$)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Ex: 80,00"
                                        value={valorTotal}
                                        onChange={(e) => setValorTotal(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-200 outline-none"
                                    />
                                </div>
                            </div>
                            {unitarioPreview != null && (
                                <p className="text-[11px] text-emerald-700">
                                    Custo unitário: <strong>{formatCurrency(unitarioPreview)}</strong> / {produto.unidade_medida}
                                    <span className="text-emerald-600/70"> · atualiza o custo do produto</span>
                                </p>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Observação (opcional)</label>
                        <input
                            type="text"
                            placeholder="Ex: lote, validade, transportadora..."
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button onClick={onClose} className="flex-1 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold transition-colors">
                            Cancelar
                        </button>
                        <button
                            onClick={handleAjuste}
                            disabled={loading}
                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-1"
                        >
                            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Modal: Histórico de Entradas (controle do que entra na empresa) ───────────
function ModalHistoricoEntradas({ onClose }: { onClose: () => void }) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [entradas, setEntradas] = useState<any[]>([])
    const [busca, setBusca] = useState('')

    useEffect(() => {
        let ativo = true
        ;(async () => {
            const { data } = await supabase
                .from('movimentacao_estoque')
                .select('id, quantidade, valor_total, valor_unitario, numero_nota_fiscal, data_compra, fornecedor, observacao, created_at, produto:produtos ( nome, unidade_medida )')
                .eq('tipo', 'entrada')
                .order('created_at', { ascending: false })
                .limit(300)
            if (!ativo) return
            setEntradas(data ?? [])
            setLoading(false)
        })()
        return () => { ativo = false }
    }, [supabase])

    const prodDe = (e: any) => (Array.isArray(e.produto) ? e.produto[0] : e.produto) ?? null
    const fmtData = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')

    const filtradas = entradas.filter((e) => {
        if (!busca) return true
        const t = busca.toLowerCase()
        return (prodDe(e)?.nome ?? '').toLowerCase().includes(t)
            || (e.fornecedor ?? '').toLowerCase().includes(t)
            || (e.numero_nota_fiscal ?? '').toLowerCase().includes(t)
    })

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <History className="w-5 h-5 text-blue-600" />
                        <div>
                            <h3 className="font-extrabold text-gray-800">Histórico de Entradas</h3>
                            <p className="text-xs text-gray-500">Tudo que entrou na empresa: NF, data e fornecedor</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                <div className="p-4 shrink-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por produto, fornecedor ou nº da nota..."
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-4">
                    {loading ? (
                        <div className="flex justify-center py-16">
                            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                        </div>
                    ) : filtradas.length === 0 ? (
                        <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
                            <Truck className="w-10 h-10 opacity-20" />
                            <p className="text-sm font-medium">Nenhuma entrada registrada ainda.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                <tr>
                                    <th className="px-3 py-2 font-semibold">Data</th>
                                    <th className="px-3 py-2 font-semibold">Produto</th>
                                    <th className="px-3 py-2 font-semibold text-right">Qtd</th>
                                    <th className="px-3 py-2 font-semibold text-right">Valor Pago</th>
                                    <th className="px-3 py-2 font-semibold">Nota Fiscal</th>
                                    <th className="px-3 py-2 font-semibold">Fornecedor</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtradas.map((e) => {
                                    const prod = prodDe(e)
                                    return (
                                        <tr key={e.id} className="hover:bg-blue-50/30">
                                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                                                {e.data_compra
                                                    ? fmtData(e.data_compra)
                                                    : new Date(e.created_at).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="px-3 py-2.5 font-semibold text-gray-800">{prod?.nome ?? '—'}</td>
                                            <td className="px-3 py-2.5 text-right text-gray-700">
                                                {Number(e.quantidade).toLocaleString('pt-BR')} {prod?.unidade_medida ?? ''}
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                {e.valor_total != null
                                                    ? <span className="font-semibold text-gray-800">{formatCurrency(Number(e.valor_total))}</span>
                                                    : <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {e.numero_nota_fiscal
                                                    ? <span className="inline-flex items-center gap-1 text-gray-700"><FileText className="w-3 h-3 text-gray-400" />{e.numero_nota_fiscal}</span>
                                                    : <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2.5 text-gray-700">{e.fornecedor || <span className="text-gray-300">—</span>}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Modal: Histórico de Compras de UM produto ────────────────────────────────
function ModalHistoricoProduto({ produto, onClose }: { produto: Produto; onClose: () => void }) {
    const supabase = createClient()
    const [loading, setLoading] = useState(true)
    const [compras, setCompras] = useState<any[]>([])

    useEffect(() => {
        let ativo = true
        ;(async () => {
            const { data } = await supabase
                .from('movimentacao_estoque')
                .select('id, quantidade, valor_total, valor_unitario, numero_nota_fiscal, data_compra, fornecedor, created_at')
                .eq('produto_id', produto.id)
                .eq('tipo', 'entrada')
                .order('data_compra', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false })
                .limit(500)
            if (!ativo) return
            setCompras(data ?? [])
            setLoading(false)
        })()
        return () => { ativo = false }
    }, [supabase, produto.id])

    const fmtData = (d: string | null, fallback: string) =>
        d ? d.split('-').reverse().join('/') : new Date(fallback).toLocaleDateString('pt-BR')

    const totalQtd = compras.reduce((acc, c) => acc + Number(c.quantidade), 0)
    const totalGasto = compras.reduce((acc, c) => acc + (c.valor_total != null ? Number(c.valor_total) : 0), 0)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <History className="w-5 h-5 text-blue-600" />
                        <div>
                            <h3 className="font-extrabold text-gray-800">Histórico de Compras</h3>
                            <p className="text-xs text-gray-500">{produto.nome} · todas as entradas, mesmo com estoque zerado</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* Resumo */}
                <div className="grid grid-cols-3 gap-2 px-4 pt-4 shrink-0">
                    {[
                        { label: 'Compras', value: compras.length },
                        { label: 'Qtd comprada', value: `${totalQtd.toLocaleString('pt-BR')} ${produto.unidade_medida}` },
                        { label: 'Total gasto', value: formatCurrency(totalGasto) },
                    ].map((s) => (
                        <div key={s.label} className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                            <p className="text-sm font-extrabold text-gray-800 truncate">{s.value}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</p>
                        </div>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex justify-center py-16">
                            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                        </div>
                    ) : compras.length === 0 ? (
                        <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
                            <Truck className="w-10 h-10 opacity-20" />
                            <p className="text-sm font-medium">Nenhuma compra registrada para este produto.</p>
                            <p className="text-xs text-gray-400">Use “Ajustar → Entrada” e preencha os dados da nota.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
                                <tr>
                                    <th className="px-3 py-2 font-semibold">Data</th>
                                    <th className="px-3 py-2 font-semibold">Fornecedor</th>
                                    <th className="px-3 py-2 font-semibold text-right">Qtd</th>
                                    <th className="px-3 py-2 font-semibold text-right">Valor Pago</th>
                                    <th className="px-3 py-2 font-semibold text-right">Custo Un.</th>
                                    <th className="px-3 py-2 font-semibold">NF</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {compras.map((c) => (
                                    <tr key={c.id} className="hover:bg-blue-50/30">
                                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmtData(c.data_compra, c.created_at)}</td>
                                        <td className="px-3 py-2.5 text-gray-700">{c.fornecedor || <span className="text-gray-300">—</span>}</td>
                                        <td className="px-3 py-2.5 text-right text-gray-700">{Number(c.quantidade).toLocaleString('pt-BR')} {produto.unidade_medida}</td>
                                        <td className="px-3 py-2.5 text-right font-semibold text-gray-800">
                                            {c.valor_total != null ? formatCurrency(Number(c.valor_total)) : <span className="text-gray-300 font-normal">—</span>}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-gray-600">
                                            {c.valor_unitario != null ? formatCurrency(Number(c.valor_unitario)) : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            {c.numero_nota_fiscal
                                                ? <span className="inline-flex items-center gap-1 text-gray-700"><FileText className="w-3 h-3 text-gray-400" />{c.numero_nota_fiscal}</span>
                                                : <span className="text-gray-300">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Página Principal ─────────────────────────────────────────────────────────
export default function EstoquePage() {
    const [produtos, setProdutos] = useState<Produto[]>([])
    const [loading, setLoading] = useState(true)
    const [busca, setBusca] = useState('')
    const [filtro, setFiltro] = useState<FiltroEstoque>('todos')
    const [modalEditar, setModalEditar] = useState<Produto | null>(null)
    const [modalAjuste, setModalAjuste] = useState<Produto | null>(null)
    const [modalHistProduto, setModalHistProduto] = useState<Produto | null>(null)
    const [isModalNovo, setIsModalNovo] = useState(false)
    const [isHistoricoOpen, setIsHistoricoOpen] = useState(false)
    const [pagina, setPagina] = useState(1)
    const supabase = createClient()

    const fetchProdutos = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('produtos')
                .select('*')
                .order('nome', { ascending: true })
            if (error) throw error
            setProdutos((data ?? []) as Produto[])
        } catch {
            toast.error('Erro ao carregar estoque')
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => { fetchProdutos() }, [fetchProdutos])

    // Estatísticas rápidas
    const stats = useMemo(() => ({
        total: produtos.length,
        criticos: produtos.filter(p => Number(p.estoque_atual) <= Number(p.estoque_minimo)).length,
        valorTotal: produtos.reduce((acc, p) => acc + Number(p.estoque_atual) * Number(p.custo), 0),
        semEstoque: produtos.filter(p => Number(p.estoque_atual) === 0).length,
    }), [produtos])

    // Filtro composto
    const produtosFiltrados = useMemo(() => {
        return produtos.filter((p) => {
            const matchBusca = !busca ||
                p.nome.toLowerCase().includes(busca.toLowerCase()) ||
                p.categoria.toLowerCase().includes(busca.toLowerCase())
            const matchFiltro =
                filtro === 'todos' ? true :
                    filtro === 'critico' ? Number(p.estoque_atual) <= Number(p.estoque_minimo) :
                        p.tipo === filtro
            return matchBusca && matchFiltro
        })
    }, [produtos, busca, filtro])

    const { paginar, totalPaginas, totalItens, itensPorPagina } = usePaginacao(produtosFiltrados, 15)
    const produtosPaginados = paginar(pagina)

    function handleBusca(valor: string) {
        setBusca(valor)
        setPagina(1)
    }
    function handleFiltro(f: FiltroEstoque) {
        setFiltro(f)
        setPagina(1)
    }

    const isCritico = (p: Produto) => Number(p.estoque_atual) <= Number(p.estoque_minimo)
    const pct = (p: Produto) => {
        const min = Number(p.estoque_minimo)
        const atual = Number(p.estoque_atual)
        if (min === 0) return 100
        return Math.min(100, Math.round((atual / min) * 100))
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <Package className="w-5 h-5 text-blue-600" />
                        Gestão de Estoque
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Controle de produtos, matérias-primas e alertas de reposição</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setIsHistoricoOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-sm"
                    >
                        <History className="w-4 h-4 text-blue-600" />
                        Histórico de Entradas
                    </button>
                    <Link
                        href="/dashboard/estoque/inventario"
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-sm"
                    >
                        <ClipboardCheck className="w-4 h-4" />
                        Fazer Inventário
                    </Link>
                    <button
                        onClick={() => setIsModalNovo(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Produto
                    </button>
                </div>
            </div>

            {/* Cards de Estatísticas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'Total de Itens', value: stats.total, icon: <Package className="w-4 h-4" />, color: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { label: 'Estoque Crítico', value: stats.criticos, icon: <AlertTriangle className="w-4 h-4" />, color: stats.criticos > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-100' },
                    { label: 'Sem Estoque', value: stats.semEstoque, icon: <TrendingDown className="w-4 h-4" />, color: stats.semEstoque > 0 ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-gray-50 text-gray-600 border-gray-100' },
                    { label: 'Valor em Estoque', value: formatCurrency(stats.valorTotal), icon: <ArrowUpCircle className="w-4 h-4" />, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                ].map((s) => (
                    <div key={s.label} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.color}`}>
                        <div className="opacity-70 shrink-0">{s.icon}</div>
                        <div className="min-w-0">
                            <p className="text-lg font-extrabold leading-none truncate">{s.value}</p>
                            <p className="text-xs opacity-70 mt-0.5 truncate">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Barra de Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou categoria..."
                        value={busca}
                        onChange={(e) => handleBusca(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {([
                        { value: 'todos', label: 'Todos' },
                        { value: 'critico', label: '🔴 Crítico' },
                        { value: 'proprio', label: 'Produção Própria' },
                        { value: 'terceirizado', label: 'Revenda de Terceiros' },
                    ] as { value: FiltroEstoque; label: string }[]).map((f) => (
                        <button
                            key={f.value}
                            onClick={() => handleFiltro(f.value)}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${filtro === f.value
                                ? f.value === 'critico'
                                    ? 'bg-red-600 border-red-600 text-white'
                                    : 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* DataTable */}
            {loading ? (
                <div className="flex justify-center p-16">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : produtosFiltrados.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 flex flex-col items-center text-gray-400">
                    <Package className="w-12 h-12 mb-3 opacity-20" />
                    <p className="font-medium">Nenhum produto encontrado</p>
                    {filtro === 'critico' && <p className="text-sm mt-1 text-emerald-600 font-semibold">✓ Nenhum item em estoque crítico!</p>}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/80 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                                <tr>
                                    <th className="px-5 py-3 font-semibold">Produto</th>
                                    <th className="px-5 py-3 font-semibold">Tipo</th>
                                    <th className="px-5 py-3 font-semibold text-right">Estoque Atual</th>
                                    <th className="px-5 py-3 font-semibold">Nível</th>
                                    <th className="px-5 py-3 font-semibold text-right">Custo Un.</th>
                                    <th className="px-5 py-3 font-semibold text-center">Status</th>
                                    <th className="px-5 py-3 font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {produtosPaginados.map((produto) => {
                                    const critico = isCritico(produto)
                                    const nivel = pct(produto)
                                    return (
                                        <tr key={produto.id} className={`transition-colors group ${critico ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-blue-50/30'}`}>
                                            {/* Produto */}
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    {critico && (
                                                        <span className="inline-flex items-center justify-center w-5 h-5 bg-red-100 rounded-full shrink-0" title="Estoque crítico">
                                                            <AlertTriangle className="w-3 h-3 text-red-600" />
                                                        </span>
                                                    )}
                                                    <div>
                                                        <p className={`font-semibold ${critico ? 'text-red-800' : 'text-gray-800'}`}>{produto.nome}</p>
                                                        <p className="text-xs text-gray-400">{produto.categoria}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Tipo — Próprio (teal/esmeralda) vs Insumo (slate neutro) */}
                                            <td className="px-5 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${produto.tipo === 'proprio' ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'}`}>
                                                    {produto.tipo === 'proprio' ? 'Próprio' : 'Insumo'}
                                                </span>
                                            </td>
                                            {/* Estoque */}
                                            <td className="px-5 py-3 text-right">
                                                <div>
                                                    <span className={`font-extrabold text-base ${critico ? 'text-red-600' : 'text-gray-800'}`}>
                                                        {Number(produto.estoque_atual).toLocaleString('pt-BR')}
                                                    </span>
                                                    <span className="text-xs text-gray-400 ml-1">{produto.unidade_medida}</span>
                                                </div>
                                                <p className="text-[10px] text-gray-400">Mín: {produto.estoque_minimo} {produto.unidade_medida}</p>
                                            </td>
                                            {/* Barra de Nível — pontas arredondadas */}
                                            <td className="px-5 py-3 w-40">
                                                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                    <div
                                                        className={`h-1.5 rounded-full transition-all ${nivel <= 25 ? 'bg-red-500' : nivel <= 75 ? 'bg-sky-400' : 'bg-emerald-500'}`}
                                                        style={{ width: `${Math.min(nivel, 100)}%` }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-gray-400 mt-0.5">{nivel}% do mínimo</p>
                                            </td>
                                            {/* Custo */}
                                            <td className="px-5 py-3 text-right text-gray-600 font-medium">
                                                {formatCurrency(produto.custo)}
                                            </td>
                                            {/* Status */}
                                            <td className="px-5 py-3 text-center">
                                                {critico ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold uppercase">
                                                        <AlertTriangle className="w-2.5 h-2.5" /> Crítico
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold uppercase">
                                                        OK
                                                    </span>
                                                )}
                                            </td>
                                            {/* Ações */}
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => setModalAjuste(produto)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                                        title="Ajustar estoque"
                                                    >
                                                        <ArrowUpCircle className="w-3.5 h-3.5" />
                                                        Ajustar
                                                    </button>
                                                    <button
                                                        onClick={() => setModalHistProduto(produto)}
                                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Histórico de compras"
                                                    >
                                                        <History className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setModalEditar(produto)}
                                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                                        title="Editar produto"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    <Paginacao
                        paginaAtual={pagina}
                        totalPaginas={totalPaginas}
                        totalItens={totalItens}
                        itensPorPagina={itensPorPagina}
                        onMudarPagina={setPagina}
                    />
                </div>
            )}

            {/* Modais */}
            {modalAjuste && (
                <ModalAjuste
                    produto={modalAjuste}
                    onClose={() => setModalAjuste(null)}
                    onSuccess={fetchProdutos}
                />
            )}
            <ModalProduto
                isOpen={isModalNovo || !!modalEditar}
                onClose={() => { setIsModalNovo(false); setModalEditar(null) }}
                onSuccess={fetchProdutos}
                produtoToEdit={modalEditar}
            />
            {isHistoricoOpen && <ModalHistoricoEntradas onClose={() => setIsHistoricoOpen(false)} />}
            {modalHistProduto && (
                <ModalHistoricoProduto produto={modalHistProduto} onClose={() => setModalHistProduto(null)} />
            )}
        </div>
    )
}
