import { z } from 'zod'

// Enum do banco de dados (tipo_produto)
export const TIPO_PRODUTO = ['proprio', 'terceirizado'] as const
export const UNIDADES_MEDIDA = ['un', 'kg', 'g', 'l', 'ml'] as const

// Schema de validação para o formulário
export const produtoSchema = z.object({
    nome: z.string().min(1, 'Nome é obrigatório'),
    codigo: z.string().optional(),
    descricao: z.string().optional(),
    preco: z.coerce.number().min(0, 'Preço deve ser maior ou igual a 0'),
    custo: z.coerce.number().min(0, 'Custo deve ser maior ou igual a 0'),
    categoria: z.string().min(1, 'Categoria é obrigatória'),
    tipo: z.enum(['proprio', 'terceirizado'] as [string, ...string[]]),
    estoque_atual: z.coerce.number().min(0, 'Estoque não pode ser negativo'),
    estoque_minimo: z.coerce.number().min(0, 'Estoque mínimo não pode ser negativo'),
    unidade_medida: z.string().min(1, 'Unidade é obrigatória'),
    ativo: z.boolean().default(true),
})

export type ProdutoFormData = z.infer<typeof produtoSchema>

// Interface completa do banco (reflete a tabela)
export interface Produto extends ProdutoFormData {
    id: string
    created_at: string
    updated_at: string
}
