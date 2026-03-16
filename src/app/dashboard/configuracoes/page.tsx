'use client'

import Link from 'next/link'
import {
    BarChart3, Building2, UserCog, ArrowRight,
    Settings, TrendingUp, Shield,
} from 'lucide-react'

const CARDS = [
    {
        title: 'Relatórios',
        description: 'Vendas, metas, desempenho e análises financeiras',
        href: '/dashboard/relatorios',
        icon: BarChart3,
        color: 'bg-blue-50 text-blue-600 border-blue-100',
        iconBg: 'bg-blue-100',
    },
    {
        title: 'Mobiliário da Empresa',
        description: 'Inventário de bens físicos: equipamentos, mobília e utensílios',
        href: '/dashboard/mobiliario',
        icon: Building2,
        color: 'bg-blue-50 text-blue-600 border-blue-100',
        iconBg: 'bg-blue-100',
    },
    {
        title: 'Usuários & Permissões',
        description: 'Gerenciar equipe, roles e acessos ao sistema',
        href: '/dashboard/usuarios',
        icon: UserCog,
        color: 'bg-blue-50 text-blue-600 border-blue-100',
        iconBg: 'bg-blue-100',
    },
]

export default function ConfiguracoesPage() {
    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-gray-600" />
                    Configurações
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    Relatórios, patrimônio e gestão de equipe
                </p>
            </div>

            {/* Cards Grid */}
            <div className="grid gap-4">
                {CARDS.map((card) => {
                    const Icon = card.icon
                    return (
                        <Link
                            key={card.href}
                            href={card.href}
                            className={`group flex items-center gap-4 p-5 rounded-2xl border transition-all
                                       hover:shadow-md hover:translate-x-1 active:scale-[0.99] ${card.color}`}
                        >
                            <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center shrink-0`}>
                                <Icon className="w-6 h-6" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-800 text-base">{card.title}</p>
                                <p className="text-sm text-gray-500 mt-0.5">{card.description}</p>
                            </div>
                            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
