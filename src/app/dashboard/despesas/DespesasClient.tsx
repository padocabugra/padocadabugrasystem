'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Wallet, Plus, ChevronLeft, ChevronRight, Pencil, Trash2, X,
    Users, Home, Zap, Droplet, Flame, Landmark, MoreHorizontal,
    CopyPlus, RefreshCw, Check, AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/formatters'
import { toast } from 'sonner'
import { registrarAuditLog } from '@/lib/audit-log'
import {
    CATEGORIAS_DESPESA, resumirDespesas, despesasParaCopiar, navegarCompetencia,
    competenciaLabel, competenciaAtual, labelCategoria,
    type Despesa, type CategoriaDespesa,
} from '@/lib/despesas'

const ICONE: Record<CategoriaDespesa, React.ElementType> = {
    funcionarios: Users,
    aluguel: Home,
    energia: Zap,
    agua: Droplet,
    gas: Flame,
    impostos: Landmark,
    outros: MoreHorizontal,
}

// Cor por categoria — para bater o olho e reconhecer o grupo.
const COR: Record<CategoriaDespesa, string> = {
    funcionarios: 'bg-violet-50 text-violet-700 border-violet-200',
    aluguel: 'bg-blue-50 text-blue-700 border-blue-200',
    energia: 'bg-amber-50 text-amber-700 border-amber-200',
    agua: 'bg-sky-50 text-sky-700 border-sky-200',
    gas: 'bg-orange-50 text-orange-700 border-orange-200',
    impostos: 'bg-rose-50 text-rose-700 border-rose-200',
    outros: 'bg-gray-50 text-gray-700 border-gray-200',
}

const FORM_VAZIO = {
    categoria: 'funcionarios' as CategoriaDespesa,
    descricao: '',
    valor: '',
    vencimento: '',
    observacao: '',
    pago: false,
}

// ── Modal: criar / editar uma despesa ────────────────────────────────────────
function ModalDespesa({
    competencia, despesa, onClose, onSalvo,
}: {
    competencia: string
    despesa: Despesa | null
    onClose: () => void
    onSalvo: () => void
}) {
    const supabase = createClient()
    const [form, setForm] = useState(() =>
        despesa
            ? {
                categoria: despesa.categoria,
                descricao: despesa.descricao,
                valor: String(despesa.valor).replace('.', ','),
                vencimento: despesa.vencimento ?? '',
                observacao: despesa.observacao ?? '',
                pago: despesa.pago,
            }
            : FORM_VAZIO
    )
    const [salvando, setSalvando] = useState(false)
    const ehFuncionario = form.categoria === 'funcionarios'

    async function salvar() {
        const valorNum = parseFloat(form.valor.replace(/\./g, '').replace(',', '.'))
        if (!form.descricao.trim()) {
            toast.error(ehFuncionario ? 'Informe o nome do funcionário' : 'Informe a descrição')
            return
        }
        if (isNaN(valorNum) || valorNum < 0) {
            toast.error('Informe um valor válido')
            return
        }

        setSalvando(true)
        try {
            const payload = {
                competencia,
                categoria: form.categoria,
                descricao: form.descricao.trim(),
                valor: valorNum,
                pago: form.pago,
                vencimento: form.vencimento || null,
                observacao: form.observacao.trim() || null,
            }
            const { error } = despesa
                ? await supabase.from('despesas').update(payload).eq('id', despesa.id)
                : await supabase.from('despesas').insert(payload)
            if (error) throw error

            registrarAuditLog({
                acao: despesa ? 'despesa.editar' : 'despesa.criar',
                entidade: 'despesas',
                entidade_id: despesa?.id,
                detalhes: { competencia, categoria: payload.categoria, descricao: payload.descricao, valor: valorNum },
            })

            toast.success(despesa ? 'Despesa atualizada' : 'Despesa lançada')
            onSalvo()
            onClose()
        } catch (err: unknown) {
            toast.error('Erro ao salvar: ' + (err instanceof Error ? err.message : 'desconhecido'))
        } finally {
            setSalvando(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
                    <div>
                        <h3 className="font-bold text-gray-800">{despesa ? 'Editar Despesa' : 'Nova Despesa'}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{competenciaLabel(competencia)}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de despesa</label>
                        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                            {CATEGORIAS_DESPESA.map(({ value, label }) => {
                                const Icone = ICONE[value]
                                const ativo = form.categoria === value
                                return (
                                    <button
                                        key={value}
                                        onClick={() => setForm((f) => ({ ...f, categoria: value }))}
                                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-[11px] font-bold transition-all ${ativo ? COR[value] + ' ring-2 ring-current' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                    >
                                        <Icone className="w-4 h-4" />
                                        {label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            {ehFuncionario ? 'Nome do funcionário' : 'Descrição'}
                        </label>
                        <input
                            value={form.descricao}
                            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                            placeholder={ehFuncionario ? 'Ex: Maria Silva' : 'Ex: Conta de luz'}
                            className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Valor (R$)</label>
                        <input
                            value={form.valor}
                            onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                            inputMode="decimal"
                            placeholder="0,00"
                            className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-lg text-lg font-bold focus:ring-2 focus:ring-blue-200 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Vencimento</label>
                            <input
                                type="date"
                                value={form.vencimento}
                                onChange={(e) => setForm((f) => ({ ...f, vencimento: e.target.value }))}
                                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Opcional</p>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Situação</label>
                            <button
                                onClick={() => setForm((f) => ({ ...f, pago: !f.pago }))}
                                className={`w-full mt-1 py-2.5 rounded-lg border-2 text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${form.pago ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-gray-200 text-gray-500'}`}
                            >
                                {form.pago ? <><Check className="w-4 h-4" /> Pago</> : 'Em aberto'}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Observação</label>
                        <input
                            value={form.observacao}
                            onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                            placeholder="Opcional"
                            className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                        />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex gap-2 sticky bottom-0 bg-white">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50">
                        Cancelar
                    </button>
                    <button
                        onClick={salvar}
                        disabled={salvando}
                        className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {salvando && <RefreshCw className="w-4 h-4 animate-spin" />}
                        {despesa ? 'Salvar' : 'Lançar'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Modal: confirmar exclusão ────────────────────────────────────────────────
function ModalExcluir({
    despesa, onClose, onExcluido,
}: {
    despesa: Despesa
    onClose: () => void
    onExcluido: () => void
}) {
    const supabase = createClient()
    const [excluindo, setExcluindo] = useState(false)

    async function excluir() {
        setExcluindo(true)
        try {
            const { error } = await supabase.from('despesas').delete().eq('id', despesa.id)
            if (error) throw error
            registrarAuditLog({
                acao: 'despesa.excluir',
                entidade: 'despesas',
                entidade_id: despesa.id,
                detalhes: { descricao: despesa.descricao, valor: Number(despesa.valor), competencia: despesa.competencia },
            })
            toast.success('Despesa excluída')
            onExcluido()
            onClose()
        } catch (err: unknown) {
            toast.error('Erro ao excluir: ' + (err instanceof Error ? err.message : 'desconhecido'))
        } finally {
            setExcluindo(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" /> Excluir despesa
                    </h3>
                </div>
                <div className="p-5">
                    <p className="text-sm text-gray-600">
                        Excluir <b>{despesa.descricao}</b> de {formatCurrency(Number(despesa.valor))}?
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Esta ação não pode ser desfeita.</p>
                </div>
                <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50">
                        Cancelar
                    </button>
                    <button
                        onClick={excluir}
                        disabled={excluindo}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm disabled:opacity-50"
                    >
                        Excluir
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function DespesasClient() {
    const supabase = createClient()
    const [competencia, setCompetencia] = useState(() => competenciaAtual())
    const [despesas, setDespesas] = useState<Despesa[]>([])
    const [faturamento, setFaturamento] = useState(0)
    const [loading, setLoading] = useState(true)
    const [copiando, setCopiando] = useState(false)
    const [modalNova, setModalNova] = useState(false)
    const [editando, setEditando] = useState<Despesa | null>(null)
    const [excluindo, setExcluindo] = useState<Despesa | null>(null)

    const fimDoMes = useMemo(() => {
        const prox = navegarCompetencia(competencia, 1)
        const [a, m] = prox.split('-').map(Number)
        const ultimo = new Date(a, m - 1, 0).getDate()
        return `${competencia.slice(0, 7)}-${String(ultimo).padStart(2, '0')}`
    }, [competencia])

    const carregar = useCallback(async () => {
        setLoading(true)
        // Despesas do mês
        const { data, error } = await supabase
            .from('despesas')
            .select('id, competencia, categoria, descricao, valor, pago, vencimento, observacao')
            .eq('competencia', competencia)
            .order('categoria')
            .order('descricao')
        if (error) toast.error('Erro ao carregar despesas')
        else setDespesas((data ?? []) as Despesa[])

        // Faturamento do mesmo mês (reusa a RPC dos relatórios) para o resultado
        const { data: vendas } = await supabase.rpc('fn_metricas_vendas', {
            p_data_inicio: `${competencia}T00:00:00-04:00`,
            p_data_fim: `${fimDoMes}T23:59:59-04:00`,
        })
        const total = (vendas ?? []).reduce(
            (s: number, m: { total_faturado: number | string }) => s + (Number(m.total_faturado) || 0), 0,
        )
        setFaturamento(total)
        setLoading(false)
    }, [supabase, competencia, fimDoMes])

    useEffect(() => { carregar() }, [carregar])

    const resumo = useMemo(() => resumirDespesas(despesas), [despesas])
    const resultado = faturamento - resumo.total

    // Copia as despesas do mês anterior que ainda não existem neste mês.
    // Idempotente: clicar duas vezes não duplica (ver despesasParaCopiar).
    async function repetirMesAnterior() {
        setCopiando(true)
        try {
            const anterior = navegarCompetencia(competencia, -1)
            const { data, error } = await supabase
                .from('despesas')
                .select('id, competencia, categoria, descricao, valor, pago, vencimento, observacao')
                .eq('competencia', anterior)
            if (error) throw error

            const paraCopiar = despesasParaCopiar((data ?? []) as Despesa[], despesas)
            if (paraCopiar.length === 0) {
                toast.info(
                    (data ?? []).length === 0
                        ? `Nenhuma despesa em ${competenciaLabel(anterior)} para copiar`
                        : 'Todas as despesas do mês anterior já estão lançadas',
                )
                return
            }

            const { error: insErr } = await supabase
                .from('despesas')
                .insert(paraCopiar.map((d) => ({ ...d, competencia, pago: false })))
            if (insErr) throw insErr

            registrarAuditLog({
                acao: 'despesa.copiar_mes',
                entidade: 'despesas',
                detalhes: { de: anterior, para: competencia, quantidade: paraCopiar.length },
            })
            toast.success(`${paraCopiar.length} despesa(s) copiada(s) de ${competenciaLabel(anterior)}`)
            carregar()
        } catch (err: unknown) {
            toast.error('Erro ao copiar: ' + (err instanceof Error ? err.message : 'desconhecido'))
        } finally {
            setCopiando(false)
        }
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-blue-600" />
                        Despesas
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Custos do negócio por mês — aluguel, contas, equipe e impostos
                    </p>
                </div>
                <button
                    onClick={() => setModalNova(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                >
                    <Plus className="w-4 h-4" />
                    Nova Despesa
                </button>
            </div>

            {/* Seletor de mês */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
                <button
                    onClick={() => setCompetencia((c) => navegarCompetencia(c, -1))}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                    title="Mês anterior"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="text-center">
                    <p className="text-base font-extrabold text-gray-900">{competenciaLabel(competencia)}</p>
                    {competencia !== competenciaAtual() && (
                        <button
                            onClick={() => setCompetencia(competenciaAtual())}
                            className="text-[11px] font-semibold text-blue-600 hover:underline"
                        >
                            voltar para o mês atual
                        </button>
                    )}
                </div>
                <button
                    onClick={() => setCompetencia((c) => navegarCompetencia(c, 1))}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                    title="Próximo mês"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {/* Resultado do mês */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="rounded-xl border p-4 bg-emerald-50 text-emerald-700 border-emerald-100">
                            <p className="text-xs font-semibold opacity-70">Faturamento</p>
                            <p className="text-xl font-extrabold mt-1">{formatCurrency(faturamento)}</p>
                        </div>
                        <div className="rounded-xl border p-4 bg-red-50 text-red-700 border-red-100">
                            <p className="text-xs font-semibold opacity-70">Despesas</p>
                            <p className="text-xl font-extrabold mt-1">{formatCurrency(resumo.total)}</p>
                        </div>
                        <div className={`rounded-xl border p-4 ${resultado >= 0 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                            <p className="text-xs font-semibold opacity-70">Resultado</p>
                            <p className="text-xl font-extrabold mt-1">{formatCurrency(resultado)}</p>
                        </div>
                        <div className="rounded-xl border p-4 bg-gray-50 text-gray-700 border-gray-100">
                            <p className="text-xs font-semibold opacity-70">Falta pagar</p>
                            <p className="text-xl font-extrabold mt-1">{formatCurrency(resumo.totalAberto)}</p>
                        </div>
                    </div>

                    <p className="text-[11px] text-gray-400 -mt-2">
                        Resultado = faturamento das vendas do mês menos as despesas lançadas aqui.
                        Não inclui as compras de mercadoria (essas ficam em Relatórios → Compras).
                    </p>

                    {/* Resumo por categoria */}
                    {resumo.porCategoria.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {resumo.porCategoria.map((c) => {
                                const Icone = ICONE[c.categoria]
                                return (
                                    <div key={c.categoria} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${COR[c.categoria]}`}>
                                        <Icone className="w-4 h-4" />
                                        <span className="text-xs font-bold">{c.label}</span>
                                        <span className="text-xs font-extrabold">{formatCurrency(c.valor)}</span>
                                        <span className="text-[10px] opacity-60">({c.qtd})</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Lista */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 gap-3">
                            <h3 className="text-sm font-bold text-gray-700">
                                Lançamentos de {competenciaLabel(competencia)}
                                <span className="ml-2 text-xs font-semibold text-gray-400">{resumo.qtd} item(ns)</span>
                            </h3>
                            <button
                                onClick={repetirMesAnterior}
                                disabled={copiando}
                                title="Traz as despesas do mês passado (aluguel, salários...). Não duplica o que já está lançado."
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                            >
                                {copiando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CopyPlus className="w-3.5 h-3.5" />}
                                Repetir mês anterior
                            </button>
                        </div>

                        {despesas.length === 0 ? (
                            <div className="px-5 py-12 text-center">
                                <Wallet className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-500 font-semibold">Nenhuma despesa lançada em {competenciaLabel(competencia)}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Use <b>Nova Despesa</b> ou <b>Repetir mês anterior</b> para começar.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {resumo.porCategoria.map((cat) => (
                                    <div key={cat.categoria}>
                                        <div className="px-5 py-2 bg-gray-50/60 flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{cat.label}</span>
                                            <span className="text-xs font-bold text-gray-600">{formatCurrency(cat.valor)}</span>
                                        </div>
                                        {despesas
                                            .filter((d) => d.categoria === cat.categoria)
                                            .map((d) => (
                                                <div key={d.id} className="px-5 py-3 flex items-center gap-3 hover:bg-blue-50/30">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 truncate">
                                                            {d.descricao}
                                                            {d.pago ? (
                                                                <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold align-middle">
                                                                    <Check className="w-2.5 h-2.5" /> PAGO
                                                                </span>
                                                            ) : (
                                                                <span className="ml-2 inline-flex px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold align-middle">
                                                                    EM ABERTO
                                                                </span>
                                                            )}
                                                        </p>
                                                        {(d.vencimento || d.observacao) && (
                                                            <p className="text-[11px] text-gray-400 truncate">
                                                                {d.vencimento && `vence ${d.vencimento.slice(0, 10).split('-').reverse().join('/')}`}
                                                                {d.vencimento && d.observacao && ' · '}
                                                                {d.observacao}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-bold text-gray-900 shrink-0">{formatCurrency(Number(d.valor))}</span>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            onClick={() => setEditando(d)}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="Editar"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => setExcluindo(d)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Excluir"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                ))}
                                <div className="px-5 py-3 bg-gray-50/60 flex items-center justify-between">
                                    <span className="text-sm font-bold text-gray-700">TOTAL DO MÊS</span>
                                    <span className="text-base font-extrabold text-gray-900">{formatCurrency(resumo.total)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Modais */}
            {modalNova && (
                <ModalDespesa
                    competencia={competencia}
                    despesa={null}
                    onClose={() => setModalNova(false)}
                    onSalvo={carregar}
                />
            )}
            {editando && (
                <ModalDespesa
                    competencia={competencia}
                    despesa={editando}
                    onClose={() => setEditando(null)}
                    onSalvo={carregar}
                />
            )}
            {excluindo && (
                <ModalExcluir
                    despesa={excluindo}
                    onClose={() => setExcluindo(null)}
                    onExcluido={carregar}
                />
            )}
        </div>
    )
}
