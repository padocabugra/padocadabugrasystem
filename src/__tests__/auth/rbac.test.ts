import { describe, it, expect } from 'vitest'
import { NAV_ITEMS } from '@/lib/types'

describe('RBAC - Navigation Items', () => {
    it('deve garantir que a gestão de Usuários seja exclusiva de admin', () => {
        // O acesso a Usuários foi movido pra DENTRO da página de Configurações
        // (card "Usuários & Permissões"), então não há item próprio no menu lateral...
        const itemUsuarios = NAV_ITEMS.find(i => i.href === '/dashboard/usuarios')
        expect(itemUsuarios).toBeUndefined()

        // ...e a porta de entrada (Configurações) é restrita a admin.
        const config = NAV_ITEMS.find(i => i.href === '/dashboard/configuracoes')
        expect(config?.roles).toEqual(['admin'])
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
