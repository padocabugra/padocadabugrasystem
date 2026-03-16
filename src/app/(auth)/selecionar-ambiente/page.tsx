import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LayoutDashboard, ShoppingCart, ShoppingBag, ChefHat, Store } from 'lucide-react'
import type { UserRole } from '@/lib/types'

// Configuração dos Ambientes
const ENVIRONMENTS = [
    {
        label: 'Painel Admin',
        path: '/dashboard',
        roles: ['admin', 'caixa'],
        icon: LayoutDashboard,
        description: 'Gestão completa'
    },
    {
        label: 'PDV / Caixa',
        path: '/dashboard/pdv',
        roles: ['admin', 'caixa', 'vendedor'],
        icon: ShoppingCart,
        description: 'Frente de caixa'
    },
    {
        label: 'Vendas / Pedidos',
        path: '/dashboard/pedidos',
        roles: ['admin', 'vendedor', 'caixa'],
        icon: ShoppingBag,
        description: 'Controle de comandas'
    },
    {
        label: 'Painel Cozinha',
        path: '/dashboard/cozinha',
        roles: ['admin', 'cozinha'],
        icon: ChefHat,
        description: 'Produção'
    },
]

export default async function SelecionarAmbientePage() {
    const supabase = await createClient()

    // 1. Verificar Autenticação
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/login')
    }

    // 2. Buscar Role do Usuário
    const { data: usuario, error } = await supabase
        .from('usuarios')
        .select('role')
        .eq('email', user.email!)
        .single()

    if (error || !usuario) {
        // Logout forçado se usuário não existir na tabela pública
        await supabase.auth.signOut()
        redirect('/login')
    }

    const userRole = usuario.role as UserRole

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
            <div className="max-w-5xl w-full text-center space-y-10">
                <div className="space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 shadow-lg shadow-blue-900/20 text-white">
                        <Store className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Bem-vindo(a) ao Padoca CRM</h1>
                    <p className="text-gray-500 text-lg">Selecione seu ambiente de trabalho para continuar.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {ENVIRONMENTS.map((env) => {
                        // Admin acessa tudo; Outros acessam conforme mapeamento de roles
                        const canAccess = userRole === 'admin' || env.roles.includes(userRole);
                        const Icon = env.icon

                        return canAccess ? (
                            <Link href={env.path} key={env.path}
                                className="group relative flex flex-col items-center justify-center bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:border-primary/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer h-64 gap-6"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />

                                <div className="relative w-16 h-16 bg-blue-50 text-primary rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                                    <Icon className="w-8 h-8" />
                                </div>
                                <div className="relative space-y-1">
                                    <h3 className="font-bold text-xl text-gray-800 group-hover:text-primary transition-colors">{env.label}</h3>
                                    <p className="text-sm text-gray-400 font-medium">{env.description}</p>
                                </div>
                            </Link>
                        ) : (
                            <div key={env.path}
                                className="flex flex-col items-center justify-center bg-gray-50 p-8 rounded-2xl border border-dashed border-gray-200 h-64 gap-6 opacity-40 cursor-not-allowed grayscale select-none"
                            >
                                <div className="w-16 h-16 bg-gray-200 text-gray-400 rounded-2xl flex items-center justify-center">
                                    <Icon className="w-8 h-8" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-bold text-xl text-gray-400">{env.label}</h3>
                                    <p className="text-sm text-gray-400">{env.description}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>


                <div className="pt-8">
                    <p className="text-xs text-gray-400 font-medium">Logado como <span className="text-gray-600 font-bold uppercase">{userRole}</span> • {user.email}</p>
                </div>
            </div>
        </div>
    )
}
