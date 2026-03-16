import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UsuariosClient from '@/components/usuarios/UsuariosClient'

// Mock do supabase client
vi.mock('@/lib/supabase/client', () => ({
    createClient: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({
                    data: [
                        { id: '1', nome: 'Admin', email: 'admin@test.com', role: 'admin', ativo: true },
                        { id: '2', nome: 'Caixa 1', email: 'caixa@test.com', role: 'caixa', ativo: true }
                    ],
                    error: null
                }))
            })),
            update: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ error: null }))
            }))
        }))
    }))
}))

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn()
    }
}))

describe('UsuariosClient', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('deve renderizar a lista de usuários', async () => {
        render(<UsuariosClient />)
        expect(await screen.findByText('Admin')).toBeDefined()
        expect(await screen.findByText('Caixa 1')).toBeDefined()
    })

    it('deve filtrar os usuários pela busca', async () => {
        render(<UsuariosClient />)
        await screen.findByText('Admin')

        const input = screen.getByPlaceholderText(/Buscar por nome/i)
        fireEvent.change(input, { target: { value: 'Caixa' } })

        await waitFor(() => {
            expect(screen.queryByText('Admin')).toBeNull()
            expect(screen.getByText('Caixa 1')).toBeDefined()
        })
    })

    it('deve abrir o modal de novo funcionário ao clicar no botão', async () => {
        render(<UsuariosClient />)
        const btn = await screen.findByText(/Novo Funcionário/i)
        fireEvent.click(btn)

        expect(await screen.findByText(/Cargo \/ Função/i)).toBeDefined()
    })
})
