'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    Menu,
    X,
    LayoutDashboard,
    ShoppingCart,
    ClipboardList,
    ChefHat,
    Users,
    Package,
    Warehouse,
    DollarSign,
    ShoppingBag,
    Settings,
    LogOut,
    FlaskConical,
    Store,
} from 'lucide-react'
import type { Usuario, NavItem } from '@/lib/types'
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

interface MobileHeaderProps {
    usuario: Usuario
}

export default function MobileHeader({ usuario }: MobileHeaderProps) {
    const [isOpen, setIsOpen] = useState(false)
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
        <>
            {/* Top Bar */}
            <header className="lg:hidden h-16 bg-white border-b border-blue-100 flex items-center justify-between px-4 sticky top-0 z-40 shadow-sm">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="p-2 -ml-2 text-gray-600 hover:bg-blue-50 rounded-xl transition-colors"
                        aria-label="Menu"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Store className="w-5 h-5 text-primary" />
                        <span className="font-bold text-primary text-sm tracking-tight">Padoca</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none">
                            {usuario.role}
                        </p>
                        <p className="text-sm font-bold text-gray-800 leading-tight">
                            {usuario.nome.split(' ')[0]}
                        </p>
                    </div>
                </div>
            </header>

            {/* Overlay Menu (Drawer) */}
            {isOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-blue-900/20 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Content */}
                    <div className="absolute top-0 left-0 bottom-0 w-[280px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
                        <div className="p-5 border-b border-blue-100 flex items-center justify-between bg-blue-50/30">
                            {/* Logo Mobile */}
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-sm">
                                    <Store className="w-4 h-4" />
                                </div>
                                <p className="font-bold text-primary text-sm">Padoca da Bugra</p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 hover:bg-white rounded-xl transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
                                        onClick={() => setIsOpen(false)}
                                        className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all ${isActive
                                            ? 'bg-primary text-white shadow-lg shadow-blue-500/20 translate-x-1'
                                            : 'text-gray-600 hover:bg-blue-50 hover:text-primary active:bg-blue-100'
                                            }`}
                                    >
                                        <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                                        {item.label}
                                    </Link>
                                )
                            })}
                        </nav>

                        <div className="p-4 border-t border-blue-100 bg-gray-50">
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold
                                           text-red-500 hover:bg-red-50 transition-colors active:scale-[0.98]"
                            >
                                <LogOut className="w-5 h-5 shrink-0" />
                                Sair do Sistema
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
