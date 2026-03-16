import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'

export default async function DashboardPage() {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: usuario } = await supabase
        .from('usuarios')
        .select('nome, role')
        .eq('email', user.email!)
        .single()

    return (
        <DashboardClient
            nomeUsuario={usuario?.nome?.split(' ')[0] ?? 'usuário'}
            role={usuario?.role ?? 'vendedor'}
        />
    )
}
