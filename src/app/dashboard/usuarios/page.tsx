import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UsuariosClient from '@/components/usuarios/UsuariosClient'

export default async function UsuariosPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Busca role do usuário para garantir que é admin
    const { data: usuario } = await supabase
        .from('usuarios')
        .select('role')
        .eq('email', user.email!)
        .single()

    if (!usuario || usuario.role !== 'admin') {
        redirect('/dashboard')
    }

    return <UsuariosClient />
}
