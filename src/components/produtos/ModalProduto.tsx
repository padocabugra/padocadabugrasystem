'use client'

import { useEffect, useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Loader2, Save, Trash2, ChevronDown, ChevronRight, ScanLine, CheckCircle2, AlertTriangle, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { registrarAuditLog } from '@/lib/audit-log'
import { isValidEAN13 } from '@/lib/formatters'
import {
    produtoSchema,
    type ProdutoFormData,
    type Produto,
    UNIDADES_MEDIDA,
    CFOP_OPTIONS,
    CSOSN_OPTIONS,
} from '@/lib/types/produto'

interface ModalProdutoProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
    produtoToEdit?: Produto | null
}

export default function ModalProduto({
    isOpen,
    onClose,
    onSuccess,
    produtoToEdit,
}: ModalProdutoProps) {
    const [fiscalAberto, setFiscalAberto] = useState(false)

    // Dar Entrada (opcional) — captura NF/fornecedor/data ao adicionar estoque.
    // Esses campos NÃO pertencem à tabela produtos (vão p/ movimentacao_estoque),
    // por isso ficam como estado local, fora do schema do formulário.
    const [darEntrada, setDarEntrada] = useState(false)
    const [numeroNF, setNumeroNF] = useState('')
    const [dataCompra, setDataCompra] = useState(() => new Date().toLocaleDateString('en-CA'))
    const [fornecedor, setFornecedor] = useState('')

    const {
        register,
        handleSubmit,
        reset,
        watch,
        formState: { errors, isSubmitting },
        setValue,
    } = useForm<ProdutoFormData>({
        resolver: zodResolver(produtoSchema) as Resolver<ProdutoFormData>,
        defaultValues: {
            ativo: true,
            disponivel_venda: true,
            tipo: 'proprio',
            unidade_medida: 'un',
            estoque_atual: 0,
            estoque_minimo: 5,
            preco: 0,
            custo: 0,
            codigo: '',
            ncm: '',
            cfop: '5101',
            csosn: '0102',
        },
    })

    const tipoAtual = watch('tipo')

    // Quando tipo muda, sincroniza CFOP automaticamente
    useEffect(() => {
        if (tipoAtual === 'proprio') {
            setValue('cfop', '5101')
        } else {
            setValue('cfop', '5102')
        }
    }, [tipoAtual, setValue])

    // Popula formulário na edição
    useEffect(() => {
        if (produtoToEdit) {
            const temDadosFiscais = !!(produtoToEdit.ncm || produtoToEdit.cfop || produtoToEdit.csosn)
            setFiscalAberto(temDadosFiscais)
            reset({
                nome: produtoToEdit.nome,
                codigo: produtoToEdit.codigo || '',
                descricao: produtoToEdit.descricao || '',
                preco: Number(produtoToEdit.preco),
                custo: Number(produtoToEdit.custo),
                categoria: produtoToEdit.categoria,
                tipo: produtoToEdit.tipo,
                estoque_atual: Number(produtoToEdit.estoque_atual),
                estoque_minimo: Number(produtoToEdit.estoque_minimo),
                unidade_medida: produtoToEdit.unidade_medida,
                ativo: produtoToEdit.ativo,
                disponivel_venda: produtoToEdit.disponivel_venda ?? true,
                ncm: produtoToEdit.ncm || '',
                cfop: produtoToEdit.cfop || (produtoToEdit.tipo === 'terceirizado' ? '5102' : '5101'),
                csosn: produtoToEdit.csosn || '0102',
            })
        } else {
            setFiscalAberto(false)
            reset({
                ativo: true,
                disponivel_venda: true,
                tipo: 'proprio',
                unidade_medida: 'un',
                estoque_atual: 0,
                estoque_minimo: 5,
                preco: 0,
                custo: 0,
                codigo: '',
                ncm: '',
                cfop: '5101',
                csosn: '0102',
            })
        }

        // Entrada com NF — sempre começa desligada e limpa ao (re)abrir o modal.
        setDarEntrada(false)
        setNumeroNF('')
        setDataCompra(new Date().toLocaleDateString('en-CA'))
        setFornecedor('')
    }, [produtoToEdit, reset, isOpen])

    async function onSubmit(data: ProdutoFormData) {
        try {
            const supabase = createClient()

            // Normaliza NCM — remove espaços, garante string ou null
            const ncmLimpo = data.ncm?.replace(/\D/g, '').slice(0, 8) || null

            // Código (SKU): trim + string vazia vira null — evita colisão no índice
            // único parcial idx_produtos_codigo_unique (que trata '' como valor real,
            // não como nulo, e por isso rejeita o 2º produto sem SKU)
            const codigoLimpo = data.codigo?.trim() ? data.codigo.trim() : null

            const payload = {
                ...data,
                codigo: codigoLimpo,
                ncm: ncmLimpo,
                cfop: data.cfop || null,
                csosn: data.csosn || null,
            }

            const estoqueAnterior = produtoToEdit ? Number(produtoToEdit.estoque_atual) : 0
            const novoEstoque = Number(data.estoque_atual)
            let produtoId = produtoToEdit?.id

            if (produtoToEdit) {
                const { error } = await supabase
                    .from('produtos')
                    .update({ ...payload, updated_at: new Date().toISOString() })
                    .eq('id', produtoToEdit.id)
                if (error) throw error
            } else {
                const { data: novo, error } = await supabase
                    .from('produtos')
                    .insert([payload])
                    .select('id')
                    .single()
                if (error) throw error
                produtoId = novo?.id
            }

            // ── Dar Entrada (opcional) ────────────────────────────────────
            // Registra a entrada da mercadoria com os dados da nota fiscal. A
            // quantidade da entrada = quanto o estoque AUMENTOU (produto novo =
            // estoque inicial; edição = o acréscimo), pra não contar em dobro.
            if (darEntrada && produtoId) {
                const qtdEntrada = Number((novoEstoque - estoqueAnterior).toFixed(3))
                if (qtdEntrada > 0) {
                    const { error: movErr } = await supabase.from('movimentacao_estoque').insert({
                        produto_id: produtoId,
                        tipo: 'entrada',
                        quantidade: qtdEntrada,
                        observacao: null,
                        numero_nota_fiscal: numeroNF.trim() || null,
                        data_compra: dataCompra || null,
                        fornecedor: fornecedor.trim() || null,
                    })
                    if (movErr) {
                        // Produto salvou, mas a entrada/NF não — avisa de verdade (não engole).
                        toast.warning('Produto salvo, mas a entrada da nota não foi registrada.', {
                            description: movErr.message,
                        })
                    } else {
                        registrarAuditLog({
                            acao: 'estoque.entrada',
                            entidade: 'produtos',
                            entidade_id: produtoId,
                            detalhes: {
                                produto: data.nome,
                                tipo: 'entrada',
                                quantidade: qtdEntrada,
                                estoqueAnterior,
                                estoqueNovo: novoEstoque,
                                numeroNotaFiscal: numeroNF.trim() || undefined,
                                dataCompra: dataCompra || undefined,
                                fornecedor: fornecedor.trim() || undefined,
                            },
                        })
                        toast.success('Entrada registrada com a nota fiscal.')
                    }
                } else {
                    toast.info('Nenhuma entrada registrada: o estoque não aumentou.')
                }
            }

            onSuccess()
            onClose()
        } catch (err: unknown) {
            const supabaseErr = err as { code?: string; message?: string }
            if (supabaseErr?.code === '23505' && supabaseErr?.message?.includes('idx_produtos_codigo_unique')) {
                console.error('Erro ao salvar produto (código duplicado):', err)
                alert(`Já existe um produto com o código "${data.codigo}". Use um código (SKU) diferente ou deixe em branco.`)
                return
            }
            const msg = err instanceof Error ? err.message : JSON.stringify(err)
            console.error('Erro ao salvar produto:', err)
            alert('Erro ao salvar produto: ' + msg)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <h2 className="text-xl font-bold text-gray-800">
                        {produtoToEdit ? 'Editar Produto' : 'Novo Produto'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Formulario */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
                    {/* Linha 1: Nome, Código e Categoria */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5 md:col-span-1">
                            <label className="text-sm font-medium text-gray-700">Nome</label>
                            <input
                                {...register('nome')}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                                placeholder="Ex: Pão Francês"
                            />
                            {errors.nome && (
                                <p className="text-xs text-red-500">{errors.nome.message}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                                <ScanLine className="w-3.5 h-3.5 text-gray-500" />
                                Código de Barras / SKU
                            </label>
                            <input
                                {...register('codigo')}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none font-mono"
                                placeholder="Ex: 7891000100103 ou PAO-FRA-50"
                            />
                            <CodigoFeedback codigo={watch('codigo')} />
                            <p className="text-[11px] text-gray-400 leading-snug">
                                Use o EAN-13 impresso na embalagem (refrigerantes, leites, etc.) ou um
                                código interno (ex: <span className="font-mono">PAO-FRA-50</span>) pra
                                produtos sem código de barras. Quando o scanner chegar, é só bipar nesse mesmo campo.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Categoria</label>
                            <select
                                {...register('categoria')}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                            >
                                <option value="">Selecione...</option>
                                <option value="Pães">Pães</option>
                                <option value="Bolos">Bolos</option>
                                <option value="Salgados">Salgados</option>
                                <option value="Bebidas">Bebidas</option>
                                <option value="Tortas">Tortas</option>
                                <option value="Doces">Doces</option>
                                <option value="Lanches">Lanches</option>
                                <option value="Outros">Outros</option>
                            </select>
                            {errors.categoria && (
                                <p className="text-xs text-red-500">{errors.categoria.message}</p>
                            )}
                        </div>
                    </div>

                    {/* Descrição */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Descrição</label>
                        <textarea
                            {...register('descricao')}
                            rows={3}
                            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none resize-none"
                            placeholder="Descreva os ingredientes ou detalhes do produto..."
                        />
                    </div>

                    {/* Linha 2: Preço e Custo */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Preço de Venda (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                {...register('preco')}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            />
                            {errors.preco && <p className="text-xs text-red-500">{errors.preco.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Custo (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                {...register('custo')}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            />
                            {errors.custo && <p className="text-xs text-red-500">{errors.custo.message}</p>}
                        </div>
                    </div>

                    {/* Linha 3: Estoques e Unidade */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Estoque Atual</label>
                            <input
                                type="number"
                                step="0.001"
                                {...register('estoque_atual')}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            />
                            {errors.estoque_atual && (
                                <p className="text-xs text-red-500">{errors.estoque_atual.message}</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Estoque Mínimo</label>
                            <input
                                type="number"
                                step="0.001"
                                {...register('estoque_minimo')}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                            />
                            {errors.estoque_minimo && (
                                <p className="text-xs text-red-500">{errors.estoque_minimo.message}</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">Unidade</label>
                            <select
                                {...register('unidade_medida')}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                            >
                                {UNIDADES_MEDIDA.map((u) => (
                                    <option key={u} value={u}>
                                        {u}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* ── Dar Entrada com Nota Fiscal (opcional) ── */}
                    <div className="border border-emerald-200 rounded-xl overflow-hidden">
                        <label className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50/60 cursor-pointer select-none">
                            <span className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                                <Truck className="w-4 h-4" />
                                Dar entrada com Nota Fiscal
                                <span className="text-[11px] font-normal text-emerald-700/70">(opcional)</span>
                            </span>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={darEntrada}
                                    onChange={(e) => setDarEntrada(e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </div>
                        </label>

                        {darEntrada && (
                            <div className="p-4 space-y-3 border-t border-emerald-100 bg-emerald-50/30">
                                <p className="text-[11px] text-emerald-700/80 leading-snug">
                                    {produtoToEdit
                                        ? 'Registra uma entrada com a nota na quantidade que o estoque aumentar (a diferença em relação ao Estoque Atual acima).'
                                        : 'Registra a entrada do estoque inicial (acima) com os dados da nota fiscal.'}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-600">Nº Nota Fiscal</label>
                                        <input
                                            type="text"
                                            placeholder="Ex: 001234"
                                            value={numeroNF}
                                            onChange={(e) => setNumeroNF(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-200 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-gray-600">Data da Compra</label>
                                        <input
                                            type="date"
                                            value={dataCompra}
                                            onChange={(e) => setDataCompra(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-200 outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-gray-600">Fornecedor</label>
                                    <input
                                        type="text"
                                        placeholder="Nome do fornecedor"
                                        value={fornecedor}
                                        onChange={(e) => setFornecedor(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-200 outline-none"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Linha 4: Tipo de Produto */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                            Tipo de Insumo
                        </label>
                        <div className="flex gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    value="proprio"
                                    {...register('tipo')}
                                    className="w-4 h-4 text-primary focus:ring-primary"
                                />
                                <span className="text-sm text-gray-600">Produção Própria</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    value="terceirizado"
                                    {...register('tipo')}
                                    className="w-4 h-4 text-primary focus:ring-primary"
                                />
                                <span className="text-sm text-gray-600">Terceirizado/Revenda</span>
                            </label>
                        </div>
                        {errors.tipo && <p className="text-xs text-red-500">{errors.tipo.message}</p>}
                    </div>

                    {/* ── Seção: Dados Fiscais (NFC-e) — Colapsável ── */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setFiscalAberto((prev) => !prev)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                📋 Dados Fiscais (NFC-e)
                                {watch('ncm') ? (
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                        NCM preenchido
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                        Usando padrão
                                    </span>
                                )}
                            </span>
                            {fiscalAberto
                                ? <ChevronDown className="w-4 h-4 text-gray-400" />
                                : <ChevronRight className="w-4 h-4 text-gray-400" />
                            }
                        </button>

                        {fiscalAberto && (
                            <div className="p-4 space-y-4 border-t border-gray-200">
                                {/* NCM */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">NCM</label>
                                    <input
                                        {...register('ncm')}
                                        maxLength={8}
                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none font-mono"
                                        placeholder="Ex: 21069090"
                                        onInput={(e) => {
                                            const el = e.currentTarget
                                            el.value = el.value.replace(/\D/g, '').slice(0, 8)
                                        }}
                                    />
                                    <p className="text-xs text-gray-400">
                                        Código NCM do produto (consultar contador). Se vazio, usa padrão <strong>21069090</strong>.
                                    </p>
                                    {errors.ncm && <p className="text-xs text-red-500">{errors.ncm.message}</p>}
                                </div>

                                {/* CFOP */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">CFOP</label>
                                    <select
                                        {...register('cfop')}
                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                                    >
                                        {CFOP_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-400">
                                        Código fiscal da operação. Muda automaticamente conforme o Tipo de Produto.
                                    </p>
                                </div>

                                {/* CSOSN */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">CSOSN</label>
                                    <select
                                        {...register('csosn')}
                                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none bg-white"
                                    >
                                        {CSOSN_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-400">
                                        Código tributário (Simples Nacional). Consulte seu contador.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer: Toggles + Botões */}
                    <div className="pt-6 border-t border-gray-100 space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-8">
                            {/* Toggle Ativo */}
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <div className="relative">
                                    <input type="checkbox" className="sr-only peer" {...register('ativo')} />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </div>
                                <span className="text-sm font-medium text-gray-700">Produto Ativo</span>
                            </label>

                            {/* Toggle Disponível para venda */}
                            <div className="flex flex-col gap-1">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <div className="relative">
                                        <input type="checkbox" className="sr-only peer" {...register('disponivel_venda')} />
                                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                    </div>
                                    <span className="text-sm font-medium text-gray-700">Disponível para venda</span>
                                </label>
                                <span className="text-xs text-gray-500 ml-[52px]">
                                    {watch('disponivel_venda')
                                        ? 'Aparece para vendedores e no cardápio'
                                        : 'Apenas para uso interno (não aparece em vendas)'}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3">
                            {produtoToEdit && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (confirm(`Tem certeza que deseja excluir o produto "${produtoToEdit.nome}"?`)) {
                                            try {
                                                const supabase = createClient()
                                                const { error } = await supabase.from('produtos').delete().eq('id', produtoToEdit.id)
                                                if (error) {
                                                    if (error.code === '23503') {
                                                        alert('Este produto não pode ser excluído pois possui vendas ou movimentações associadas. Apenas inative-o.')
                                                    } else {
                                                        throw error
                                                    }
                                                } else {
                                                    onSuccess()
                                                    onClose()
                                                }
                                            } catch (err: unknown) {
                                                const msg = err instanceof Error ? err.message : JSON.stringify(err)
                                                alert('Erro ao excluir produto: ' + msg)
                                            }
                                        }
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2 mr-auto"
                                    disabled={isSubmitting}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Excluir Produto
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                disabled={isSubmitting}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Salvando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Salvar Produto
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Feedback inline pra ajudar a Bugra a saber se o que digitou é EAN-13 válido
// ou se é apenas um SKU interno (qualquer outro formato).
function CodigoFeedback({ codigo }: { codigo?: string }) {
    const valor = (codigo ?? '').trim()
    if (!valor) return null

    // 13 dígitos exatos = tentativa de EAN-13
    if (/^\d{13}$/.test(valor)) {
        if (isValidEAN13(valor)) {
            return (
                <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    EAN-13 válido
                </p>
            )
        }
        return (
            <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                EAN-13 inválido — confira o último dígito da embalagem
            </p>
        )
    }

    // Só números mas não 13 dígitos — pode ser EAN-8, código truncado ou em digitação
    if (/^\d+$/.test(valor) && valor.length !== 12) {
        return (
            <p className="text-[11px] text-gray-500">
                {valor.length < 13
                    ? `${valor.length}/13 dígitos — EAN-13 tem 13 dígitos`
                    : `${valor.length} dígitos — formato não reconhecido como EAN-13`}
            </p>
        )
    }

    // Outro formato = SKU interno
    return (
        <p className="text-[11px] text-gray-500">
            Tratado como SKU interno (código não-EAN)
        </p>
    )
}
