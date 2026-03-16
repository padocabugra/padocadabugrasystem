'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    X, Save, Loader2, FlaskConical, Plus, Trash2,
    ChevronRight, ChevronLeft, ImagePlus,
    Clock, UtensilsCrossed, DollarSign, ShieldAlert, Salad,
    FileText, Package,
} from 'lucide-react'
import type { Produto } from '@/lib/types/produto'
import type { Receita, IngredienteReceita, InstrucaoPreparo, Alergenos, Nutricao } from '@/lib/types/receita'
import { CATEGORIAS_PRATO, UNIDADES } from '@/lib/types/receita'

const TABS = [
    { id: 'identificacao', label: 'Identificação', icon: FileText },
    { id: 'ingredientes', label: 'Ingredientes', icon: Package },
    { id: 'preparo', label: 'Preparo', icon: Clock },
    { id: 'apresentacao', label: 'Apresentação', icon: UtensilsCrossed },
    { id: 'custos', label: 'Custos', icon: DollarSign },
    { id: 'adicionais', label: 'Adicionais', icon: ShieldAlert },
    { id: 'nutricao', label: 'Nutrição', icon: Salad },
] as const

type TabId = typeof TABS[number]['id']

interface IngredienteForm {
    produto_id: string
    quantidade: string
    unidade: string
    custo_unitario: string
    marca: string
    fornecedor: string
}

interface Props {
    onClose: () => void
    onSuccess: () => void
    receitaEdit: Receita | null
    produtosProprios: Produto[]
    produtosInsumos: Produto[]
}

function emptyIngrediente(): IngredienteForm {
    return { produto_id: '', quantidade: '', unidade: 'un', custo_unitario: '', marca: '', fornecedor: '' }
}

export default function ModalFichaTecnica({ onClose, onSuccess, receitaEdit, produtosProprios, produtosInsumos }: Props) {
    const [tab, setTab] = useState<TabId>('identificacao')
    const [saving, setSaving] = useState(false)
    const supabase = createClient()

    // 1) Identificação
    const [nome, setNome] = useState(receitaEdit?.nome ?? '')
    const [produtoFinalId, setProdutoFinalId] = useState(receitaEdit?.produto_id ?? '')
    const [categoria, setCategoria] = useState(receitaEdit?.categoria ?? '')
    const [codigoInterno, setCodigoInterno] = useState(receitaEdit?.codigo_interno ?? '')
    const [descricao, setDescricao] = useState(receitaEdit?.descricao ?? '')
    const [rendimentoTotal, setRendimentoTotal] = useState(receitaEdit?.rendimento_total ?? '')
    const [pesoPorPorcao, setPesoPorPorcao] = useState(receitaEdit?.peso_por_porcao ?? '')
    const [imagemUrl, setImagemUrl] = useState(receitaEdit?.imagem_url ?? '')

    // 2) Ingredientes
    const [ingredientes, setIngredientes] = useState<IngredienteForm[]>(
        receitaEdit?.ingredientes?.map((i) => ({
            produto_id: i.produto_id,
            quantidade: String(i.quantidade),
            unidade: i.unidade,
            custo_unitario: String(i.custo_unitario ?? ''),
            marca: i.marca ?? '',
            fornecedor: i.fornecedor ?? '',
        })) ?? [emptyIngrediente()]
    )
    const [comentariosIng, setComentariosIng] = useState(receitaEdit?.comentarios_ingredientes ?? '')

    // 3) Preparo
    const [tempoPrep, setTempoPrep] = useState(String(receitaEdit?.tempo_preparacao ?? ''))
    const [tempoCoccao, setTempoCoccao] = useState(String(receitaEdit?.tempo_coccao ?? ''))
    const [tempoDescanso, setTempoDescanso] = useState(String(receitaEdit?.tempo_descanso ?? ''))
    const [instrucoes, setInstrucoes] = useState<string[]>(
        receitaEdit?.instrucoes_preparo?.map((i) => i.descricao) ?? ['']
    )

    // 4) Apresentação
    const [pratoRecipiente, setPratoRecipiente] = useState(receitaEdit?.prato_recipiente ?? '')
    const [posicionamento, setPosicionamento] = useState(receitaEdit?.posicionamento_itens ?? '')
    const [guarnicoes, setGuarnicoes] = useState(receitaEdit?.guarnicoes_decoracao ?? '')
    const [sugestaoAcomp, setSugestaoAcomp] = useState(receitaEdit?.sugestao_acompanhamento ?? '')
    const [imgEmpratamento, setImgEmpratamento] = useState(receitaEdit?.imagem_empratamento_url ?? '')

    // 5) Custos
    const [custoPorcao, setCustoPorcao] = useState(String(receitaEdit?.custo_por_porcao ?? ''))
    const [despesaOp, setDespesaOp] = useState(String(receitaEdit?.despesa_operacional ?? ''))
    const [custoTotalPorcao, setCustoTotalPorcao] = useState(String(receitaEdit?.custo_total_porcao ?? ''))
    const [margemLucro, setMargemLucro] = useState(String(receitaEdit?.margem_lucro ?? ''))
    const [precoVenda, setPrecoVenda] = useState(String(receitaEdit?.preco_venda_sugerido ?? ''))

    // 6) Adicionais
    const [alergenos, setAlergenos] = useState<Alergenos>(
        receitaEdit?.alergenos ?? { gluten: false, lactose: false, nuts: false, outros: [] }
    )
    const [obsEspeciais, setObsEspeciais] = useState(receitaEdit?.observacoes_especiais ?? '')

    // 7) Nutrição
    const [nutricao, setNutricao] = useState<Nutricao>(
        receitaEdit?.nutricao ?? { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0, fibras: 0 }
    )

    // ── Helpers ────────────────────────────────────────────────────────────
    function addIngrediente() { setIngredientes(p => [...p, emptyIngrediente()]) }
    function removeIngrediente(idx: number) { setIngredientes(p => p.filter((_, i) => i !== idx)) }
    function updateIng(idx: number, field: keyof IngredienteForm, value: string) {
        setIngredientes(p => p.map((ing, i) => {
            if (i !== idx) return ing
            if (field === 'produto_id') {
                const prod = produtosInsumos.find(p => p.id === value)
                return { ...ing, produto_id: value, unidade: prod?.unidade_medida ?? 'un' }
            }
            return { ...ing, [field]: value }
        }))
    }

    function addInstrucao() { setInstrucoes(p => [...p, '']) }
    function removeInstrucao(idx: number) { setInstrucoes(p => p.filter((_, i) => i !== idx)) }
    function updateInstrucao(idx: number, val: string) { setInstrucoes(p => p.map((v, i) => i === idx ? val : v)) }

    const custoTotalIng = ingredientes.reduce((sum, ing) => {
        const qty = parseFloat(ing.quantidade.replace(',', '.')) || 0
        const cost = parseFloat(ing.custo_unitario.replace(',', '.')) || 0
        return sum + qty * cost
    }, 0)

    function calcularPrecoVenda() {
        const cp = parseFloat(custoPorcao.replace(',', '.')) || 0
        const dop = parseFloat(despesaOp.replace(',', '.')) || 0
        const ct = cp + dop
        setCustoTotalPorcao(ct.toFixed(2))
        const ml = parseFloat(margemLucro.replace(',', '.')) || 0
        if (ml > 0) {
            const pv = ct / (1 - ml / 100)
            setPrecoVenda(pv.toFixed(2))
        }
    }

    const tabIdx = TABS.findIndex(t => t.id === tab)
    function nextTab() { if (tabIdx < TABS.length - 1) setTab(TABS[tabIdx + 1].id) }
    function prevTab() { if (tabIdx > 0) setTab(TABS[tabIdx - 1].id) }

    // ── Salvar ─────────────────────────────────────────────────────────────
    async function handleSalvar() {
        if (!nome.trim()) { toast.error('Informe o nome da receita'); setTab('identificacao'); return }
        if (!produtoFinalId) { toast.error('Selecione o produto final'); setTab('identificacao'); return }
        const ingValidos = ingredientes.filter(i => i.produto_id && parseFloat(i.quantidade) > 0)
        if (ingValidos.length === 0) { toast.error('Adicione ao menos um ingrediente'); setTab('ingredientes'); return }

        setSaving(true)
        try {
            const payload = {
                nome: nome.trim(),
                produto_id: produtoFinalId,
                categoria, codigo_interno: codigoInterno, descricao,
                rendimento_total: rendimentoTotal, peso_por_porcao: pesoPorPorcao,
                imagem_url: imagemUrl,
                ingredientes: ingValidos.map(i => ({
                    produto_id: i.produto_id,
                    quantidade: parseFloat(i.quantidade.replace(',', '.')) || 0,
                    unidade: i.unidade,
                    custo_unitario: parseFloat(i.custo_unitario.replace(',', '.')) || 0,
                    custo_total: (parseFloat(i.quantidade.replace(',', '.')) || 0) * (parseFloat(i.custo_unitario.replace(',', '.')) || 0),
                    marca: i.marca, fornecedor: i.fornecedor,
                })),
                custo_total_ingredientes: custoTotalIng,
                comentarios_ingredientes: comentariosIng,
                tempo_preparacao: parseInt(tempoPrep) || 0,
                tempo_coccao: parseInt(tempoCoccao) || 0,
                tempo_descanso: parseInt(tempoDescanso) || 0,
                instrucoes_preparo: instrucoes.filter(Boolean).map((d, i) => ({ ordem: i + 1, descricao: d })),
                prato_recipiente: pratoRecipiente, posicionamento_itens: posicionamento,
                guarnicoes_decoracao: guarnicoes, sugestao_acompanhamento: sugestaoAcomp,
                imagem_empratamento_url: imgEmpratamento,
                custo_por_porcao: parseFloat(custoPorcao.replace(',', '.')) || 0,
                despesa_operacional: parseFloat(despesaOp.replace(',', '.')) || 0,
                custo_total_porcao: parseFloat(custoTotalPorcao.replace(',', '.')) || 0,
                margem_lucro: parseFloat(margemLucro.replace(',', '.')) || 0,
                preco_venda_sugerido: parseFloat(precoVenda.replace(',', '.')) || 0,
                alergenos, observacoes_especiais: obsEspeciais, nutricao,
                updated_at: new Date().toISOString(),
            }

            if (receitaEdit) {
                const { error } = await supabase.from('receitas').update(payload).eq('id', receitaEdit.id)
                if (error) throw error
                toast.success('Ficha técnica atualizada!')
            } else {
                const { error } = await supabase.from('receitas').insert(payload)
                if (error) throw error
                toast.success('Ficha técnica criada com sucesso!')
            }
            onSuccess()
            onClose()
        } catch (err: any) {
            toast.error('Erro ao salvar: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    // ── Input helpers ──────────────────────────────────────────────────────
    const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 outline-none transition-all bg-white'
    const labelCls = 'block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5'
    const textareaCls = `${inputCls} resize-none`

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                    <h2 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
                        <FlaskConical className="w-5 h-5 text-primary" />
                        {receitaEdit ? 'Editar Ficha Técnica' : 'Nova Ficha Técnica'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-4 py-2 border-b border-gray-100 overflow-x-auto shrink-0 bg-gray-50/50">
                    {TABS.map((t) => {
                        const Icon = t.icon
                        const active = tab === t.id
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${active
                                    ? 'bg-primary text-white shadow-sm'
                                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                                    }`}
                            >
                                <Icon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{t.label}</span>
                            </button>
                        )
                    })}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* TAB: Identificação */}
                    {tab === 'identificacao' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className={labelCls}>Nome do Prato *</label>
                                    <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Pão Francês 100 unidades" className={inputCls} autoFocus />
                                </div>
                                <div>
                                    <label className={labelCls}>Categoria</label>
                                    <select value={categoria} onChange={e => setCategoria(e.target.value)} className={inputCls}>
                                        <option value="">— Selecione —</option>
                                        {CATEGORIAS_PRATO.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Código Interno</label>
                                    <input value={codigoInterno} onChange={e => setCodigoInterno(e.target.value)} placeholder="Ex: PF-001" className={inputCls} />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className={labelCls}>Produto Final (produzido) *</label>
                                    <select value={produtoFinalId} onChange={e => setProdutoFinalId(e.target.value)} className={`${inputCls} bg-blue-50 border-blue-200 font-semibold`}>
                                        <option value="">— Selecione o produto final —</option>
                                        {produtosProprios.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.unidade_medida})</option>)}
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className={labelCls}>Descrição do prato</label>
                                    <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} placeholder="Breve descrição do conceito/experiência" className={textareaCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Rendimento Total</label>
                                    <input value={rendimentoTotal} onChange={e => setRendimentoTotal(e.target.value)} placeholder="Ex: 4 porções / 2kg" className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Peso por Porção</label>
                                    <input value={pesoPorPorcao} onChange={e => setPesoPorPorcao(e.target.value)} placeholder="Ex: 250g" className={inputCls} />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className={labelCls}>URL da Imagem (referência visual)</label>
                                    <div className="flex gap-2">
                                        <input value={imagemUrl} onChange={e => setImagemUrl(e.target.value)} placeholder="https://..." className={`${inputCls} flex-1`} />
                                        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0 border border-gray-200 overflow-hidden">
                                            {imagemUrl ? <img src={imagemUrl} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-4 h-4 text-gray-400" />}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: Ingredientes */}
                    {tab === 'ingredientes' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500">Informe quantidades por 1 lote. Inclua temperos, óleos, sal, etc.</p>
                                <button onClick={addIngrediente} className="flex items-center gap-1 text-xs text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg font-semibold transition-colors">
                                    <Plus className="w-3.5 h-3.5" /> Adicionar
                                </button>
                            </div>
                            <div className="space-y-2">
                                {ingredientes.map((ing, idx) => (
                                    <div key={idx} className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <select value={ing.produto_id} onChange={e => updateIng(idx, 'produto_id', e.target.value)} className="flex-1 min-w-0 px-2.5 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none">
                                                <option value="">— Insumo —</option>
                                                {produtosInsumos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                            </select>
                                            <input type="number" min="0" step="0.001" placeholder="Qtd" value={ing.quantidade} onChange={e => updateIng(idx, 'quantidade', e.target.value)} className="w-20 px-2 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-center outline-none" />
                                            <select value={ing.unidade} onChange={e => updateIng(idx, 'unidade', e.target.value)} className="w-16 px-1.5 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none">
                                                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                            <input type="number" min="0" step="0.01" placeholder="R$ unit." value={ing.custo_unitario} onChange={e => updateIng(idx, 'custo_unitario', e.target.value)} className="w-24 px-2 py-2 bg-white border border-gray-200 rounded-lg text-xs text-center outline-none" />
                                            <button onClick={() => removeIngrediente(idx)} disabled={ingredientes.length === 1} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <input placeholder="Marca" value={ing.marca} onChange={e => updateIng(idx, 'marca', e.target.value)} className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none" />
                                            <input placeholder="Fornecedor" value={ing.fornecedor} onChange={e => updateIng(idx, 'fornecedor', e.target.value)} className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none" />
                                            {ing.custo_unitario && ing.quantidade && (
                                                <div className="shrink-0 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-emerald-700">
                                                    R$ {((parseFloat(ing.quantidade.replace(',', '.')) || 0) * (parseFloat(ing.custo_unitario.replace(',', '.')) || 0)).toFixed(2)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {custoTotalIng > 0 && (
                                <div className="flex items-center justify-end gap-2 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                                    <span className="text-xs font-bold text-primary uppercase">Custo Total Ingredientes:</span>
                                    <span className="text-base font-extrabold text-primary">R$ {custoTotalIng.toFixed(2)}</span>
                                </div>
                            )}
                            <div>
                                <label className={labelCls}>Comentários</label>
                                <textarea value={comentariosIng} onChange={e => setComentariosIng(e.target.value)} rows={2} placeholder="Notas sobre marcas, fornecedores, perdas no preparo..." className={textareaCls} />
                            </div>
                        </div>
                    )}

                    {/* TAB: Preparo */}
                    {tab === 'preparo' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className={labelCls}>Preparação (min)</label>
                                    <input type="number" min="0" value={tempoPrep} onChange={e => setTempoPrep(e.target.value)} className={`${inputCls} text-center font-bold`} />
                                </div>
                                <div>
                                    <label className={labelCls}>Cocção (min)</label>
                                    <input type="number" min="0" value={tempoCoccao} onChange={e => setTempoCoccao(e.target.value)} className={`${inputCls} text-center font-bold`} />
                                </div>
                                <div>
                                    <label className={labelCls}>Descanso (min)</label>
                                    <input type="number" min="0" value={tempoDescanso} onChange={e => setTempoDescanso(e.target.value)} className={`${inputCls} text-center font-bold`} />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <label className={labelCls}>Instruções Passo a Passo</label>
                                <button onClick={addInstrucao} className="flex items-center gap-1 text-xs text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg font-semibold transition-colors">
                                    <Plus className="w-3.5 h-3.5" /> Passo
                                </button>
                            </div>
                            <div className="space-y-2">
                                {instrucoes.map((inst, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                        <div className="w-7 h-7 bg-primary/10 text-primary rounded-lg flex items-center justify-center text-xs font-extrabold shrink-0 mt-1">{idx + 1}</div>
                                        <textarea value={inst} onChange={e => updateInstrucao(idx, e.target.value)} rows={2} placeholder={`Descreva o passo ${idx + 1}...`} className={`${textareaCls} flex-1`} />
                                        <button onClick={() => removeInstrucao(idx)} disabled={instrucoes.length === 1} className="p-1.5 text-red-400 hover:text-red-600 rounded-lg transition-colors disabled:opacity-30 mt-1">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAB: Apresentação */}
                    {tab === 'apresentacao' && (
                        <div className="space-y-4">
                            <div><label className={labelCls}>Prato / Recipiente utilizado</label><input value={pratoRecipiente} onChange={e => setPratoRecipiente(e.target.value)} className={inputCls} placeholder="Ex: Prato de cerâmica branco 28cm" /></div>
                            <div><label className={labelCls}>Posicionamento dos itens</label><textarea value={posicionamento} onChange={e => setPosicionamento(e.target.value)} rows={2} className={textareaCls} placeholder="Descreva como posicionar os itens no prato" /></div>
                            <div><label className={labelCls}>Guarnições e Decoração</label><textarea value={guarnicoes} onChange={e => setGuarnicoes(e.target.value)} rows={2} className={textareaCls} placeholder="Folhas, ervas, sementes, molho..." /></div>
                            <div><label className={labelCls}>Sugestão de Acompanhamento</label><input value={sugestaoAcomp} onChange={e => setSugestaoAcomp(e.target.value)} className={inputCls} placeholder="Ex: Arroz branco, salada verde..." /></div>
                            <div>
                                <label className={labelCls}>Foto do Empratamento (URL)</label>
                                <div className="flex gap-2">
                                    <input value={imgEmpratamento} onChange={e => setImgEmpratamento(e.target.value)} placeholder="https://..." className={`${inputCls} flex-1`} />
                                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center shrink-0 border border-gray-200 overflow-hidden">
                                        {imgEmpratamento ? <img src={imgEmpratamento} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-4 h-4 text-gray-400" />}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: Custos */}
                    {tab === 'custos' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className={labelCls}>Custo ingredientes / porção (R$)</label><input type="number" step="0.01" value={custoPorcao} onChange={e => setCustoPorcao(e.target.value)} className={inputCls} /></div>
                                <div><label className={labelCls}>Despesa operacional (R$)</label><input type="number" step="0.01" value={despesaOp} onChange={e => setDespesaOp(e.target.value)} className={inputCls} placeholder="Mão de obra, gás, energia..." /></div>
                                <div><label className={labelCls}>Custo total / porção (R$)</label><input type="number" step="0.01" value={custoTotalPorcao} onChange={e => setCustoTotalPorcao(e.target.value)} className={`${inputCls} bg-gray-50 font-bold`} readOnly /></div>
                                <div><label className={labelCls}>Margem de lucro (%)</label><input type="number" step="0.1" value={margemLucro} onChange={e => setMargemLucro(e.target.value)} className={inputCls} /></div>
                            </div>
                            <button onClick={calcularPrecoVenda} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all">
                                <DollarSign className="w-4 h-4" /> Calcular Preço de Venda
                            </button>
                            {parseFloat(precoVenda) > 0 && (
                                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4">
                                    <DollarSign className="w-5 h-5 text-emerald-600" />
                                    <div>
                                        <p className="text-xs text-emerald-600 font-bold uppercase">Preço de Venda Sugerido</p>
                                        <p className="text-2xl font-extrabold text-emerald-700">R$ {parseFloat(precoVenda).toFixed(2)}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: Adicionais */}
                    {tab === 'adicionais' && (
                        <div className="space-y-5">
                            <div>
                                <label className={labelCls}>Alérgenos</label>
                                <div className="flex flex-wrap gap-3 mt-2">
                                    {(['gluten', 'lactose', 'nuts'] as const).map(key => (
                                        <label key={key} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all ${alergenos[key] ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                                            <input type="checkbox" checked={alergenos[key]} onChange={e => setAlergenos(p => ({ ...p, [key]: e.target.checked }))} className="accent-red-600 w-4 h-4" />
                                            <span className="text-sm font-semibold capitalize">{key === 'nuts' ? 'Nozes / Nuts' : key === 'gluten' ? 'Glúten' : 'Lactose'}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>Observações Especiais</label>
                                <textarea value={obsEspeciais} onChange={e => setObsEspeciais(e.target.value)} rows={4} className={textareaCls} placeholder="Restrições de dieta, ingredientes sazonais, substituições aceitas..." />
                            </div>
                        </div>
                    )}

                    {/* TAB: Nutrição */}
                    {tab === 'nutricao' && (
                        <div className="space-y-4">
                            <p className="text-xs text-gray-500">Informação nutricional por porção (opcional)</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {([
                                    ['calorias', 'Calorias (kcal)'],
                                    ['proteinas', 'Proteínas (g)'],
                                    ['carboidratos', 'Carboidratos (g)'],
                                    ['gorduras', 'Gorduras (g)'],
                                    ['fibras', 'Fibras (g)'],
                                ] as const).map(([key, label]) => (
                                    <div key={key}>
                                        <label className={labelCls}>{label}</label>
                                        <input type="number" step="0.1" value={nutricao[key] || ''} onChange={e => setNutricao(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))} className={`${inputCls} text-center font-bold`} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white">
                    <div className="flex gap-2">
                        <button onClick={prevTab} disabled={tabIdx === 0} className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-30">
                            <ChevronLeft className="w-4 h-4" /> Anterior
                        </button>
                        <button onClick={nextTab} disabled={tabIdx === TABS.length - 1} className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-30">
                            Próximo <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-semibold transition-colors">Cancelar</button>
                        <button onClick={handleSalvar} disabled={saving} className="btn-primary w-full sm:w-auto mt-2 sm:mt-0 px-6 py-2 disabled:opacity-60">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
