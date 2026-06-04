import { z } from 'zod'

// Enums alinhados com o banco de dados
export const STATUS_PEDIDO = ['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'] as const
export const FORMA_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito'] as const
export const TIPO_PEDIDO = ['local', 'delivery'] as const
// Destino de produção do pedido (para onde a comanda é roteada ao ser enviada).
// 'cozinha' e 'cafeteria' entram em filas de produção (status 'pendente');
// 'caixa' = venda direta, já nasce 'pronto'. São mutuamente exclusivos.
export const DESTINO_PEDIDO = ['cozinha', 'cafeteria', 'caixa'] as const

export type StatusPedido = (typeof STATUS_PEDIDO)[number]
export type FormaPagamento = (typeof FORMA_PAGAMENTO)[number]
export type TipoPedido = (typeof TIPO_PEDIDO)[number]
export type DestinoPedido = (typeof DESTINO_PEDIDO)[number]

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
    comanda_id: string | null        // FK → comandas.id
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
    comanda?: { numero: number }
}

// ─────────────────────────────────────────
// Item no carrinho local (estado da página)
// ─────────────────────────────────────────
//
// Itens "un" (unidade discreta) fundem por produto_id — somar +1 incrementa
// a quantidade da mesma linha.
//
// Itens "kg" (vendidos por peso) sao linhas independentes — cada pesagem
// gera um cart_item_id novo, mesmo que seja o mesmo produto. Isso preserva
// o registro individual de cada peso anotado pelo garcom.
//
// Pra itens "kg":
//   - preco        = preço por kg (snapshot do produto.preco)
//   - quantidade   = peso em kg (ex: 0.500 pra 500g)
//   - peso_gramas  = peso em gramas (display)
//   - subtotal     = quantidade * preco  (igual aos itens "un")
export interface ItemCarrinho {
    cart_item_id: string         // uuid local, unico por linha do carrinho
    produto_id: string
    nome: string
    preco: number                // preço unitário OU preço por kg
    quantidade: number           // unidades OU peso em kg
    unidade_medida: string       // 'un' | 'kg' | 'g' | 'l' | 'ml'
    peso_gramas?: number         // apenas em itens pesados, pra display
}

// ─────────────────────────────────────────
// Payload enviado para o RPC
// ─────────────────────────────────────────
export const criarPedidoSchema = z.object({
    cliente_id: z.string().uuid().nullable().optional(),
    numero_mesa: z.number().int().min(1).nullable().optional(),
    comanda_id: z.string().uuid().nullable().optional(),
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
