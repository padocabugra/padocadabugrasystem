import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CaixaClient from '@/components/caixa/CaixaClient'
import { getInicioDoDia } from '@/lib/timezone'

export const metadata = {
    title: 'PDV & Caixa | Padoca CRM',
    description: 'Ponto de Venda e controle de caixa integrado.',
}

export default async function CaixaPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Busca o usuário na tabela usuarios para obter o id interno
    const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, nome')
        .eq('id', user.id)
        .single()

    if (!usuario) redirect('/login')

    // Início do dia corrente timezone MS
    const inicioDia = getInicioDoDia()

    // Abertura mais recente do dia
    const { data: aberturaCandidata } = await supabase
        .from('caixa')
        .select('id, valor, saldo, created_at')
        .eq('usuario_id', usuario.id)
        .eq('tipo', 'abertura')
        .gte('created_at', inicioDia)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    // Se houver fechamento posterior à abertura, considera o caixa fechado
    // (o operador precisa reabrir manualmente). Caso contrário, abertura ativa.
    let aberturaHoje = aberturaCandidata
    if (aberturaCandidata) {
        const { data: fechamentoPosterior } = await supabase
            .from('caixa')
            .select('id')
            .eq('usuario_id', usuario.id)
            .eq('tipo', 'fechamento')
            .gt('created_at', aberturaCandidata.created_at)
            .limit(1)
            .maybeSingle()
        if (fechamentoPosterior) aberturaHoje = null
    }

    // Saldo atual do turno ativo (última movimentação após a abertura ativa)
    const { data: ultimaMovimentacao } = aberturaHoje
        ? await supabase
            .from('caixa')
            .select('saldo')
            .eq('usuario_id', usuario.id)
            .gte('created_at', aberturaHoje.created_at)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null }

    // Busca pedidos com status 'pronto' para o PDV consumir
    const { data: pedidosProntos } = await supabase
        .from('pedidos')
        .select(`
            id,
            numero_mesa,
            total,
            status,
            created_at,
            cliente:clientes ( nome, cpf ),
            itens_pedido (
                id,
                quantidade,
                preco_unitario,
                subtotal,
                produto:produtos ( id, codigo, nome, unidade_medida, ncm, cfop, csosn )
            )
        `)
        .eq('status', 'pronto')
        .order('created_at', { ascending: true })

    return (
        <CaixaClient
            usuarioId={usuario.id}
            usuarioNome={usuario.nome}
            aberturaHoje={aberturaHoje}
            saldoAtual={ultimaMovimentacao?.saldo ?? null}
            pedidosProntosIniciais={(pedidosProntos ?? []) as any}
        />
    )
}
