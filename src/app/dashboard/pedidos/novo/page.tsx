import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NovoPedidoClient from '@/components/pedidos/NovoPedidoClient'
import type { Produto } from '@/lib/types'
import { Truck } from 'lucide-react'

interface NovoPedidoPageProps {
    searchParams: Promise<{ tipo?: string }>
}

// Server Component: busca dados e passa para o Client Component
export default async function NovoPedidoPage({ searchParams }: NovoPedidoPageProps) {
    const supabase = await createClient()
    const params = await searchParams

    const tipoInicial = params.tipo === 'delivery' ? 'delivery' as const : 'local' as const
    const isDelivery = tipoInicial === 'delivery'

    // Verifica sessão
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Busca id do vendedor na tabela usuarios
    const { data: usuario, error: usuarioError } = await supabase
        .from('usuarios')
        .select('id')
        .eq('email', user.email!)
        .single()

    if (usuarioError || !usuario) redirect('/selecionar-ambiente')

    // Busca todos os produtos ativos
    const { data: produtos } = await supabase
        .from('produtos')
        .select('id, nome, preco, categoria, descricao, ativo, estoque_atual, estoque_minimo, tipo, unidade_medida, custo, codigo, created_at, updated_at')
        .eq('ativo', true)
        .order('categoria', { ascending: true })
        .order('nome', { ascending: true })

    return (
        <div className="flex flex-col gap-4">
            {/* Header da página */}
            <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {isDelivery && <Truck className="w-5 h-5 text-primary" />}
                    {isDelivery ? 'Novo Pedido Delivery' : 'Novo Pedido'}
                </h1>
                <p className="text-sm text-gray-500">
                    {isDelivery
                        ? 'Monte o pedido delivery e envie para a cozinha.'
                        : 'Lance os itens, selecione o cliente e envie para a cozinha.'}
                </p>
            </div>

            {/* Área principal — toda a lógica é Client-side */}
            <NovoPedidoClient
                produtos={(produtos as Produto[]) ?? []}
                vendedorId={usuario.id}
                tipoInicial={tipoInicial}
            />
        </div>
    )
}
