import { describe, it, expect } from 'vitest'
import { NAV_ITEMS } from '@/lib/types'

describe('RBAC - Navigation Items', () => {
    it('deve garantir que "Usuários" seja visível apenas para admin', () => {
        const item = NAV_ITEMS.find(i => i.href === '/dashboard/usuarios')
        expect(item?.roles).toEqual(['admin'])
    })

    it('deve garantir que "PDV" seja visível para admin, caixa e vendedor', () => {
        const item = NAV_ITEMS.find(i => i.href === '/dashboard/pdv')
        expect(item?.roles).toContain('admin')
        expect(item?.roles).toContain('caixa')
        expect(item?.roles).toContain('vendedor')
    })

    it('deve garantir que "Painel Cozinha" seja acessível para cozinha e admin', () => {
        const item = NAV_ITEMS.find(i => i.href === '/dashboard/cozinha')
        expect(item?.roles).toContain('admin')
        expect(item?.roles).toContain('cozinha')
    })
})
