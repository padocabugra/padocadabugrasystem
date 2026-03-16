// ── Types: Ficha Técnica Completa ─────────────────────────────────────────────

export interface IngredienteReceita {
    produto_id: string
    quantidade: number
    unidade: string
    custo_unitario?: number
    custo_total?: number
    marca?: string
    fornecedor?: string
}

export interface InstrucaoPreparo {
    ordem: number
    descricao: string
}

export interface Alergenos {
    gluten: boolean
    lactose: boolean
    nuts: boolean
    outros: string[]
}

export interface Nutricao {
    calorias: number
    proteinas: number
    carboidratos: number
    gorduras: number
    fibras: number
}

export interface Receita {
    id: string
    nome: string
    produto_id: string
    created_at: string
    updated_at: string
    produto?: { id: string; nome: string; unidade_medida: string; estoque_atual?: number }

    // 1) Identificação do Prato
    categoria: string
    codigo_interno: string
    descricao: string
    rendimento_total: string
    peso_por_porcao: string
    imagem_url: string

    // 2) Ingredientes + Custos
    ingredientes: IngredienteReceita[]
    custo_total_ingredientes: number
    comentarios_ingredientes: string

    // 3) Preparo
    tempo_preparacao: number
    tempo_coccao: number
    tempo_descanso: number
    instrucoes_preparo: InstrucaoPreparo[]

    // 4) Apresentação & Empratamento
    prato_recipiente: string
    posicionamento_itens: string
    guarnicoes_decoracao: string
    sugestao_acompanhamento: string
    imagem_empratamento_url: string

    // 5) Cálculos de Custo e Preço
    custo_por_porcao: number
    despesa_operacional: number
    custo_total_porcao: number
    margem_lucro: number
    preco_venda_sugerido: number

    // 6) Informações Adicionais
    alergenos: Alergenos
    observacoes_especiais: string

    // 7) Nutrição
    nutricao: Nutricao
}

export const CATEGORIAS_PRATO = [
    'Entrada',
    'Prato Principal',
    'Sobremesa',
    'Bebida',
    'Lanche',
    'Pão',
    'Confeitaria',
    'Salgado',
    'Café da Manhã',
    'Acompanhamento',
    'Outro',
] as const

export const UNIDADES = ['un', 'kg', 'g', 'l', 'ml', 'cx', 'pct', 'saco', 'colher', 'xícara'] as const
