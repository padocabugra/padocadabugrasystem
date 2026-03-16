import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Usuario } from '@/lib/types'
import Sidebar from '@/components/layout/Sidebar'
import MobileHeader from '@/components/layout/MobileHeader'
import EnvironmentSwitcher from '@/components/layout/EnvironmentSwitcher'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    // Verifica sessão ativa
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Busca role do usuário na tabela usuarios
    const { data: usuario, error } = await supabase
        .from('usuarios')
        .select('id, email, nome, role, ativo')
        .eq('email', user.email!)
        .single()

    // Se usuário não existir na tabela ou estiver inativo, desloga e redireciona
    if (error || !usuario || !usuario.ativo) {
        await supabase.auth.signOut()
        redirect('/login')
    }

    // TypeScript pode não inferir que usuario não é null após o redirect
    const currentUser = usuario as Usuario

    return (
        <div className="flex flex-col lg:flex-row h-screen bg-blue-50/30 overflow-hidden">
            <Sidebar usuario={currentUser} />
            <MobileHeader usuario={currentUser} />
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="hidden lg:flex h-16 border-b border-blue-100 bg-white items-center justify-between px-6 shadow-sm z-10">
                    <div className="flex items-center gap-4">
                        <EnvironmentSwitcher usuario={currentUser} />
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Informações do Usuário (Mobile/Desktop) */}
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-semibold text-gray-900">{currentUser.nome}</p>
                            <p className="text-xs text-secondary capitalize font-medium">{currentUser.role}</p>
                        </div>
                    </div>
                </header>
                <main className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-blue-100 scrollbar-track-transparent">
                    {children}
                </main>
            </div>
        </div>
    )
}
