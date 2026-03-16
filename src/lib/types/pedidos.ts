import { z } from 'zod'

// Enums alinhados com o banco de dados
export const STATUS_PEDIDO = ['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'] as const
export const FORMA_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito'] as const
export const TIPO_PEDIDO = ['local', 'delivery'] as const

export type StatusPedido = (typeof STATUS_PEDIDO)[number]
export type FormaPagamento = (typeof FORMA_PAGAMENTO)[number]
export type TipoPedido = (typeof TIPO_PEDIDO)[number]

// Interface alinhada com o schema real da tabela itens_pedido
export interface ItemPedido {
    id?: string
    pedido_id?: string
    produto_id: string
    quantidade: number
    preco_unitario: number          // coluna real: preco_unitario
    subtotal?: number
    produto?: {
        nome: string
        preco: number
    }
}

// Interface alinhada com o schema real da tabela pedidos
export interface Pedido {
    id: string
    numero_mesa: number | null       // coluna real: numero_mesa
    cliente_id: string | null
    vendedor_id: string | null       // coluna real: vendedor_id
    total: number                    // coluna real: total (não valor_total)
    forma_pagamento: FormaPagamento | null
    status: StatusPedido
    tipo_pedido: TipoPedido           // 'local' | 'delivery'
    created_at: string
    updated_at?: string
    itens?: ItemPedido[]
    cliente?: { nome: string }
}

// ─────────────────────────────────────────
// Item no carrinho local (estado da página)
// ─────────────────────────────────────────
export interface ItemCarrinho {
    produto_id: string
    nome: string
    preco: number                // preco unitário do produto
    quantidade: number
}

// ─────────────────────────────────────────
// Payload enviado para o RPC
// ─────────────────────────────────────────
export const criarPedidoSchema = z.object({
    cliente_id: z.string().uuid().nullable().optional(),
    numero_mesa: z.number().int().min(1).nullable().optional(),
    vendedor_id: z.string().uuid(),
    total: z.number().min(0.01),
    tipo_pedido: z.enum(['local', 'delivery']).default('local'),
    itens: z.array(
        z.object({
            produto_id: z.string().uuid(),
            quantidade: z.number().min(0.001),
            preco_unitario: z.number().min(0),
        })
    ).min(1, 'Adicione pelo menos um item ao pedido'),
})

export type CriarPedidoInput = z.infer<typeof criarPedidoSchema>
