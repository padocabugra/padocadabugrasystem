import { z } from 'zod'

// Enum do banco de dados (tipo_produto)
export const TIPO_PRODUTO = ['proprio', 'terceirizado'] as const
export const UNIDADES_MEDIDA = ['un', 'kg', 'g', 'l', 'ml'] as const

// Opções fixas para CFOP e CSOSN
export const CFOP_OPTIONS = [
    { value: '5101', label: '5101 — Venda de produção própria' },
    { value: '5102', label: '5102 — Revenda de mercadoria' },
] as const

// Apenas os CSOSN que a emissão de NFC-e sabe montar hoje (ver CSOSN_SUPORTADOS
// em lib/brasilnfe.ts). Oferecer 0300/0500/0900 aqui antes era uma armadilha: a
// equipe selecionava, mas o payload não montava o ICMS exigido e a SEFAZ rejeitava
// ("CSOSN indevido" / Rejeição 806). O 0500 (ICMS-ST) volta quando a feature de
// CEST (feat/cest-wip) for finalizada e enviar CEST + campos de ICMS-ST.
export const CSOSN_OPTIONS = [
    { value: '0102', label: '0102 — Simples Nacional, sem permissão de crédito' },
] as const

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
    disponivel_venda: z.boolean().default(true),
    // Campos fiscais — todos opcionais, nunca bloqueiam o cadastro
    ncm: z.string().max(8).optional().or(z.literal('')),
    cfop: z.string().optional(),
    csosn: z.string().optional(),
})

export type ProdutoFormData = z.infer<typeof produtoSchema>

// Interface completa do banco (reflete a tabela)
export type Produto = Omit<ProdutoFormData, 'ncm' | 'cfop' | 'csosn'> & {
    id: string
    created_at: string
    updated_at: string
    ncm?: string | null
    cfop?: string | null
    csosn?: string | null
}
