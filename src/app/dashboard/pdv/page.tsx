import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getInicioDoDia } from '@/lib/timezone'
import VendaRapidaClient from '@/components/pdv/VendaRapidaClient'
import type { Produto } from '@/lib/types'

export const metadata = {
    title: 'Venda Rápida | Padoca CRM',
    description: 'PDV de balcão — venda rápida sem cadastro de cliente.',
}

export default async function PdvPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: usuario } = await supabase
        .from('usuarios')
        .select('id, nome')
        .eq('email', user.email!)
        .single()

    if (!usuario) redirect('/login')

    const inicioDia = getInicioDoDia()

    const { data: aberturaHoje } = await supabase
        .from('caixa')
        .select('id, valor, created_at')
        .eq('usuario_id', usuario.id)
        .eq('tipo', 'abertura')
        .gte('created_at', inicioDia)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    const { data: produtos } = await supabase
        .from('produtos')
        .select('*')
        .eq('ativo', true)
        .eq('disponivel_venda', true)
        .order('nome')

    return (
        <VendaRapidaClient
            vendedorId={usuario.id}
            vendedorNome={usuario.nome}
            caixaAberto={!!aberturaHoje}
            produtos={(produtos ?? []) as Produto[]}
        />
    )
}
