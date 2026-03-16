'use client'

import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingCart, ShoppingBag, ChefHat, ChevronsUpDown } from 'lucide-react'
import type { Usuario } from '@/lib/types'

const ENVIRONMENTS = [
    { label: 'Painel Admin', path: '/dashboard', icon: LayoutDashboard },
    { label: 'PDV / Caixa', path: '/dashboard/pdv', icon: ShoppingCart },
    { label: 'Vendas / Pedidos', path: '/dashboard/pedidos', icon: ShoppingBag },
    { label: 'Painel Cozinha', path: '/dashboard/cozinha', icon: ChefHat },
]

export default function EnvironmentSwitcher({ usuario }: { usuario: Usuario }) {
    const router = useRouter()
    const pathname = usePathname()

    // Encontrar ambiente atual
    // Ordena por tamanho do path decrescente para pegar o mais específico
    const sortedEnvs = [...ENVIRONMENTS].sort((a, b) => b.path.length - a.path.length)
    const currentEnv = sortedEnvs.find(env =>
        env.path === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(env.path)
    ) || ENVIRONMENTS[0]

    const handleSwitch = (path: string) => {
        router.push(path)
    }

    if (usuario.role !== 'admin') {
        const Icon = currentEnv.icon
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-md border border-gray-200">
                <Icon className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">{currentEnv.label}</span>
            </div>
        )
    }

    // Admin Dropdown (Native Select styled to look like shadcn)
    return (
        <div className="relative w-[200px]">
            <select
                className="w-full appearance-none bg-white border border-gray-200 hover:border-blue-300 px-3 py-2 pr-8 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                value={currentEnv.path}
                onChange={(e) => handleSwitch(e.target.value)}
            >
                {ENVIRONMENTS.map(env => (
                    <option key={env.path} value={env.path}>
                        {env.label}
                    </option>
                ))}
            </select>
            <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>
    )
}
