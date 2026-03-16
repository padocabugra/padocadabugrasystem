'use client'

import { useEffect } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, Loader2, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
    produtoSchema,
    type ProdutoFormData,
    type Produto,
    UNIDADES_MEDIDA,
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
    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
        setValue,
    } = useForm<ProdutoFormData>({
        resolver: zodResolver(produtoSchema) as Resolver<ProdutoFormData>,
        defaultValues: {
            ativo: true,
            tipo: 'proprio',
            unidade_medida: 'un',
            estoque_atual: 0,
            estoque_minimo: 5,
            preco: 0,
            custo: 0,
            codigo: '',
        },
    })

    // Popula formulário na edição
    useEffect(() => {
        if (produtoToEdit) {
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
            })
        } else {
            reset({
                ativo: true,
                tipo: 'proprio',
                unidade_medida: 'un',
                estoque_atual: 0,
                estoque_minimo: 5,
                preco: 0,
                custo: 0,
                codigo: '',
            })
        }
    }, [produtoToEdit, reset, isOpen])

    async function onSubmit(data: ProdutoFormData) {
        try {
            const supabase = createClient()

            if (produtoToEdit) {
                // Atualização
                const { error } = await supabase
                    .from('produtos')
                    .update({
                        ...data,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', produtoToEdit.id)

                if (error) throw error
            } else {
                // Criação
                const { error } = await supabase.from('produtos').insert([
                    {
                        ...data,
                    },
                ])

                if (error) throw error
            }

            onSuccess()
            onClose()
        } catch (error) {
            console.error('Erro ao salvar produto:', error)
            alert('Erro ao salvar produto. Verifique o console.')
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
                            <label className="text-sm font-medium text-gray-700">Código (SKU)</label>
                            <input
                                {...register('codigo')}
                                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none font-mono"
                                placeholder="Ex: PAO-001"
                            />
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
                    <div className="grid grid-cols-3 gap-4">
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

                    {/* Footer: Toggle Ativo + Botões */}
                    <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <div className="relative">
                                <input type="checkbox" className="sr-only peer" {...register('ativo')} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </div>
                            <span className="text-sm font-medium text-gray-700">Produto Ativo</span>
                        </label>

                        <div className="flex items-center gap-3">
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
