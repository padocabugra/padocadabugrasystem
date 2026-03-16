'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard,
    ShoppingBag,
    ChefHat,
    Users,
    Package,
    Warehouse,
    DollarSign,
    LogOut,
    ShoppingCart,
    ClipboardList,
    Settings,
    FlaskConical,
    Store,
} from 'lucide-react'
import type { Usuario, NavItem, UserRole } from '@/lib/types'
import { NAV_ITEMS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const ICON_MAP: Record<string, React.ElementType> = {
    '/dashboard': LayoutDashboard,
    '/dashboard/pdv': ShoppingCart,
    '/dashboard/pedidos': ClipboardList,
    '/dashboard/cozinha': ChefHat,
    '/dashboard/clientes': Users,
    '/dashboard/produtos': Package,
    '/dashboard/estoque': Warehouse,
    '/dashboard/producao': ShoppingBag,
    '/dashboard/producao/receitas': FlaskConical,
    '/dashboard/caixa': DollarSign,
    '/dashboard/configuracoes': Settings,
}

const ROLE_LABELS: Record<UserRole, string> = {
    admin: 'Administrador',
    caixa: 'Caixa',
    vendedor: 'Vendedor',
    cozinha: 'Cozinha',
}

interface SidebarProps {
    usuario: Usuario
}

export default function Sidebar({ usuario }: SidebarProps) {
    const pathname = usePathname()
    const router = useRouter()

    const visibleItems = NAV_ITEMS.filter((item: NavItem) =>
        item.roles.includes(usuario.role)
    )

    async function handleLogout() {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <aside className="hidden lg:flex w-64 h-full bg-white border-r border-blue-100 flex-col shadow-sm">
            {/* Logo */}
            <div className="p-5 border-b border-blue-100">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm">
                        <Store className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="font-bold text-primary text-sm leading-tight">Padoca da Bugra</p>
                        <p className="text-xs text-secondary">Sistema de Gestão</p>
                    </div>
                </div>
            </div>

            {/* Navegação */}
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
                {visibleItems.map((item: NavItem) => {
                    const Icon = ICON_MAP[item.href] ?? LayoutDashboard
                    const isFichas = pathname.startsWith('/dashboard/producao/receitas')
                    const isActive = item.href === '/dashboard'
                        ? pathname === '/dashboard'
                        : item.href === '/dashboard/producao'
                            ? pathname.startsWith('/dashboard/producao') && !isFichas
                            : pathname.startsWith(item.href)

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? 'bg-primary text-white shadow-md shadow-blue-900/5'
                                : 'text-gray-600 hover:bg-blue-50 hover:text-primary'
                                }`}
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            {item.label}
                        </Link>
                    )
                })}
            </nav>

            {/* Usuário e Logout */}
            <div className="p-3 border-t border-blue-100">
                <div className="px-3 py-2 mb-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{usuario.nome}</p>
                    <p className="text-xs text-secondary">{ROLE_LABELS[usuario.role]}</p>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
            text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                    <LogOut className="w-4 h-4 shrink-0" />
                    Sair
                </button>
            </div>
        </aside>
    )
}
