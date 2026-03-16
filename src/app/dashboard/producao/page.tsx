'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    ChefHat, FlaskConical, AlertTriangle, CheckCircle2,
    RefreshCw, Package, ArrowRight, Layers,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface IngredienteReceita {
    produto_id: string
    quantidade: number   // por lote
    unidade: string
}

interface Receita {
    id: string
    nome: string
    ingredientes: IngredienteReceita[]
    produto: { id: string; nome: string; unidade_medida: string; estoque_atual: number } | null
}

interface ProdutoEstoque {
    id: string
    nome: string
    estoque_atual: number
    unidade_medida: string
}

// ── Componente Principal ──────────────────────────────────────────────────────

export default function ProducaoPage() {
    const [receitas, setReceitas] = useState<Receita[]>([])
    const [produtosMap, setProdutosMap] = useState<Record<string, ProdutoEstoque>>({})
    const [receitaId, setReceitaId] = useState('')
    const [lotes, setLotes] = useState<string>('1')
    const [loading, setLoading] = useState(true)
    const [processando, setProcessando] = useState(false)
    const [ultimaProducao, setUltimaProducao] = useState<string | null>(null)
    const supabase = createClient()

    useEffect(() => {
        async function fetchDados() {
            setLoading(true)
            const [recRes, prodRes] = await Promise.all([
                supabase
                    .from('receitas')
                    .select('id, nome, ingredientes, produto:produtos!produto_id(id, nome, unidade_medida, estoque_atual)')
                    .order('nome'),
                supabase.from('produtos').select('id, nome, estoque_atual, unidade_medida').eq('ativo', true),
            ])
            if (recRes.data) setReceitas(recRes.data as any)
            if (prodRes.data) {
                const map: Record<string, ProdutoEstoque> = {}
                for (const p of prodRes.data) map[p.id] = p
                setProdutosMap(map)
            }
            setLoading(false)
        }
        fetchDados()
    }, [supabase])

    const receitaSelecionada = useMemo(
        () => receitas.find((r) => r.id === receitaId) ?? null,
        [receitas, receitaId]
    )

    const loteNum = parseFloat(lotes.replace(',', '.')) || 0

    // Preview: ingredientes com estoque e status
    const previewIngredientes = useMemo(() => {
        if (!receitaSelecionada || loteNum <= 0) return []
        return receitaSelecionada.ingredientes.map((ing) => {
            const prod = produtosMap[ing.produto_id]
            const necessario = ing.quantidade * loteNum
            const disponivel = prod ? Number(prod.estoque_atual) : 0
            const suficiente = disponivel >= necessario
            return {
                nome: prod?.nome ?? ing.produto_id,
                unidade: ing.unidade || prod?.unidade_medida || 'un',
                necessario,
                disponivel,
                suficiente,
            }
        })
    }, [receitaSelecionada, loteNum, produtosMap])

    const podeProducir = previewIngredientes.length > 0 && previewIngredientes.every((i) => i.suficiente)

    async function handleRegistrar() {
        if (!receitaId || loteNum <= 0) { toast.error('Selecione uma receita e informe os lotes'); return }
        setProcessando(true)
        try {
            const { data, error } = await supabase.rpc('registrar_producao', {
                p_receita_id: receitaId,
                p_quantidade_lotes: loteNum,
            })
            if (error) throw new Error(error.message)

            const msg = `✅ Produção registrada! ${loteNum} lote(s) de "${receitaSelecionada?.nome}"`
            setUltimaProducao(msg)
            toast.success(msg, { duration: 6000 })
            setLotes('1')

            // Atualiza estoque dos produtos no mapa local
            const prodRes = await supabase.from('produtos').select('id, nome, estoque_atual, unidade_medida').eq('ativo', true)
            if (prodRes.data) {
                const map: Record<string, ProdutoEstoque> = {}
                for (const p of prodRes.data) map[p.id] = p
                setProdutosMap(map)
            }
        } catch (err: any) {
            toast.error('Erro na produção: ' + err.message, { duration: 8000 })
        } finally {
            setProcessando(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (receitas.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-gray-400">
                <FlaskConical className="w-12 h-12 opacity-20" />
                <p className="font-semibold text-base">Nenhuma ficha técnica cadastrada</p>
                <a href="/dashboard/producao/receitas" className="text-sm text-blue-600 font-semibold hover:underline flex items-center gap-1">
                    Criar primeira receita <ArrowRight className="w-4 h-4" />
                </a>
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <ChefHat className="w-5 h-5 text-blue-600" />
                        Registro de Produção
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Registre lotes produzidos. O sistema debita os insumos e aumenta o estoque do produto final.
                    </p>
                </div>
                <a
                    href="/dashboard/producao/receitas"
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all active:scale-[0.98] shadow-sm shrink-0"
                >
                    <FlaskConical className="w-4 h-4" />
                    Fichas Técnicas
                </a>
            </div>

            {/* Card principal */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Seleção de Receita + Lotes */}
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                            Receita / Ficha Técnica
                        </label>
                        <select
                            value={receitaId}
                            onChange={(e) => { setReceitaId(e.target.value); setUltimaProducao(null) }}
                            className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                        >
                            <option value="">— Selecione uma receita —</option>
                            {receitas.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.nome} {r.produto ? `→ ${r.produto.nome}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {receitaSelecionada && (
                        <div className="flex items-end gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                    Quantidade de Lotes
                                </label>
                                <input
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    placeholder="1"
                                    value={lotes}
                                    onChange={(e) => setLotes(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 focus:border-blue-400 rounded-xl text-xl font-extrabold text-center outline-none transition-all"
                                />
                            </div>
                            <div className="pb-0.5 text-gray-400 text-2xl font-light">=</div>
                            <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center">
                                <p className="text-xs text-blue-500 font-semibold uppercase tracking-wide">Produz</p>
                                <p className="text-xl font-extrabold text-blue-700">
                                    {loteNum > 0 ? loteNum : '–'}
                                    <span className="text-sm font-semibold ml-1">{receitaSelecionada.produto?.unidade_medida ?? 'un'}</span>
                                </p>
                                <p className="text-xs text-blue-400 truncate">{receitaSelecionada.produto?.nome ?? 'Produto Final'}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Preview dos Ingredientes */}
                {receitaSelecionada && loteNum > 0 && previewIngredientes.length > 0 && (
                    <div className="border-t border-gray-100">
                        <div className="px-6 py-3 bg-gray-50/70 flex items-center justify-between">
                            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                                <FlaskConical className="w-3.5 h-3.5" />
                                Consumo de Insumos (Preview)
                            </h3>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${podeProducir ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {podeProducir ? '✓ Estoque OK' : '✗ Estoque Insuficiente'}
                            </span>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {previewIngredientes.map((ing, idx) => (
                                <div key={idx} className={`flex items-center justify-between px-6 py-3 ${!ing.suficiente ? 'bg-red-50/50' : ''}`}>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${ing.suficiente ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        <span className="text-sm font-medium text-gray-800">{ing.nome}</span>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-bold ${ing.suficiente ? 'text-gray-800' : 'text-red-700'}`}>
                                            {ing.necessario.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {ing.unidade}
                                        </p>
                                        <p className={`text-xs ${ing.suficiente ? 'text-gray-400' : 'text-red-600 font-semibold'}`}>
                                            Disponível: {ing.disponivel.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {ing.unidade}
                                            {!ing.suficiente && ` (falta ${(ing.necessario - ing.disponivel).toFixed(3)})`}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer com botão */}
                {receitaSelecionada && (
                    <div className="px-6 py-4 bg-gray-50/70 border-t border-gray-100 space-y-3">
                        {!podeProducir && previewIngredientes.length > 0 && (
                            <div className="flex items-center gap-2 text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                Estoque insuficiente. Faça a reposição dos insumos críticos antes de produzir.
                            </div>
                        )}
                        {ultimaProducao && (
                            <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                {ultimaProducao}
                            </div>
                        )}
                        <button
                            onClick={handleRegistrar}
                            disabled={processando || !podeProducir || loteNum <= 0}
                            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl font-extrabold text-sm transition-all active:scale-[0.98] disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                        >
                            {processando ? (
                                <><RefreshCw className="w-4 h-4 animate-spin" /> Registrando...</>
                            ) : (
                                <><ChefHat className="w-4 h-4" /> Confirmar Produção</>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Estoque atual do produto final */}
            {receitaSelecionada?.produto && (
                <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-gray-500 font-medium">Estoque atual de {receitaSelecionada.produto.nome}</p>
                        <p className="text-lg font-extrabold text-gray-800">
                            {Number(produtosMap[receitaSelecionada.produto.id]?.estoque_atual ?? receitaSelecionada.produto.estoque_atual).toLocaleString('pt-BR')}{' '}
                            <span className="text-sm font-semibold text-gray-400">{receitaSelecionada.produto.unidade_medida}</span>
                        </p>
                    </div>
                    {loteNum > 0 && (
                        <div className="text-right">
                            <p className="text-xs text-gray-400">Após produção</p>
                            <p className="text-base font-extrabold text-emerald-600">
                                {(Number(produtosMap[receitaSelecionada.produto.id]?.estoque_atual ?? receitaSelecionada.produto.estoque_atual) + loteNum).toLocaleString('pt-BR')} {receitaSelecionada.produto.unidade_medida}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
