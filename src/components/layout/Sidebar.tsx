'use client'

import { useState } from 'react'
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
    ChevronLeft,
    ChevronRight,
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
    const [isCollapsed, setIsCollapsed] = useState(false)

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
        <aside 
            className={`hidden lg:flex flex-col relative h-full bg-primary text-white transition-all duration-300 ease-in-out shadow-lg z-20 ${
                isCollapsed ? 'w-[5rem]' : 'w-64'
            }`}
        >
            {/* Botão Retrátil */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-1/2 -translate-y-1/2 bg-white border border-primary text-primary w-6 h-6 rounded-full flex items-center justify-center shadow-md hover:scale-110 hover:bg-gray-50 transition-all focus:outline-none"
                title={isCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
            >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            {/* Logo */}
            <div className={`p-5 border-b border-white/10 flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-start'}`}>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 shrink-0 rounded-xl bg-white flex items-center justify-center text-primary shadow-sm">
                        <Store className="w-5 h-5" />
                    </div>
                    {!isCollapsed && (
                        <div className="overflow-hidden whitespace-nowrap opacity-100 transition-opacity duration-300">
                            <p className="font-bold text-white text-sm leading-tight">Padoca da Bugra</p>
                            <p className="text-xs text-blue-200">Sistema de Gestão</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Navegação */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
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
                            className={`flex items-center rounded-lg text-sm font-medium transition-all group relative overflow-hidden ${
                                isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'
                            } ${
                                isActive
                                    ? 'bg-white text-primary shadow-sm'
                                    : 'text-blue-100 hover:bg-white/10 hover:text-white'
                            }`}
                            title={isCollapsed ? item.label : undefined}
                        >
                            <Icon className={`shrink-0 ${isCollapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
                            {!isCollapsed && (
                                <span className="whitespace-nowrap">{item.label}</span>
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Usuário e Logout */}
            <div className={`p-3 border-t border-white/10 flex flex-col ${isCollapsed ? 'items-center gap-3' : 'gap-1'}`}>
                {!isCollapsed && (
                    <div className="px-3 py-2 mb-1 overflow-hidden whitespace-nowrap">
                        <p className="text-sm font-semibold text-white truncate">{usuario.nome}</p>
                        <p className="text-xs text-blue-200">{ROLE_LABELS[usuario.role]}</p>
                    </div>
                )}
                <button
                    onClick={handleLogout}
                    className={`flex items-center rounded-lg text-sm font-medium transition-colors
                    text-blue-200 hover:bg-red-500/20 hover:text-red-100 ${
                        isCollapsed ? 'justify-center p-3 w-auto' : 'w-full gap-3 px-3 py-2.5'
                    }`}
                    title={isCollapsed ? 'Sair' : undefined}
                >
                    <LogOut className={`shrink-0 ${isCollapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
                    {!isCollapsed && <span>Sair</span>}
                </button>
            </div>
        </aside>
    )
}
