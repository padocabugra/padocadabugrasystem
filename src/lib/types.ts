export type UserRole = 'admin' | 'caixa' | 'vendedor' | 'cozinha'

export interface Usuario {
    id: string
    email: string
    nome: string
    role: UserRole
    ativo: boolean
}

export interface NavItem {
    label: string
    href: string
    roles: UserRole[]
}

export type { Produto } from './types/produto'

export const NAV_ITEMS: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        roles: ['admin', 'caixa'],
    },
    {
        label: 'PDV / Vender',
        href: '/dashboard/pdv',
        roles: ['admin', 'caixa', 'vendedor'],
    },
    {
        label: 'Pedidos',
        href: '/dashboard/pedidos',
        roles: ['admin', 'caixa', 'vendedor'],
    },
    {
        label: 'Cozinha',
        href: '/dashboard/cozinha',
        roles: ['admin', 'cozinha'],
    },
    {
        label: 'Clientes',
        href: '/dashboard/clientes',
        roles: ['admin', 'caixa', 'vendedor'],
    },
    {
        label: 'Produtos',
        href: '/dashboard/produtos',
        roles: ['admin', 'caixa'],
    },
    {
        label: 'Estoque',
        href: '/dashboard/estoque',
        roles: ['admin'],
    },
    {
        label: 'Produção',
        href: '/dashboard/producao',
        roles: ['admin', 'cozinha'],
    },
    {
        label: 'Fichas Técnicas',
        href: '/dashboard/producao/receitas',
        roles: ['admin', 'cozinha'],
    },
    {
        label: 'Caixa',
        href: '/dashboard/caixa',
        roles: ['admin', 'caixa'],
    },
    {
        label: 'Configurações',
        href: '/dashboard/configuracoes',
        roles: ['admin'],
    },
]
