import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PainelCozinhaClient from '@/components/cozinha/PainelCozinhaClient'
import * as supabaseClient from '@/lib/supabase/client'

// Mocks
const mockSupabase = {
    channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis()
    })),
    from: vi.fn(() => ({
        update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null }))
        })),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ data: [], error: null }))
    })),
    auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: { id: '1' } } }))
    },
    removeChannel: vi.fn()
}

vi.mock('@/lib/supabase/client', () => ({
    createClient: vi.fn(() => mockSupabase)
}))

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
    }
}))

const mockPedidos = [
    {
        id: '1',
        numero_mesa: 10,
        total: 100,
        status: 'pendente' as const,
        created_at: new Date().toISOString(),
        itens: [{ quantidade: 1, produto_nome: 'Pão', produto_id: 'p1' }]
    }
]

describe('PainelCozinhaClient', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('deve renderizar as colunas do Kanban', () => {
        render(<PainelCozinhaClient pedidosIniciais={mockPedidos} />)
        expect(screen.getByText('Pendentes')).toBeDefined()
        expect(screen.getByText('Em Preparo')).toBeDefined()
        expect(screen.getByText('Prontos')).toBeDefined()
    })

    it('deve exibir o item do pedido', () => {
        render(<PainelCozinhaClient pedidosIniciais={mockPedidos} />)
        expect(screen.getByText('Mesa 10')).toBeDefined()
        expect(screen.getByText('Pão')).toBeDefined()
    })

    it('deve abrir o modal de ajuda ao pressionar "?"', async () => {
        render(<PainelCozinhaClient pedidosIniciais={mockPedidos} />)
        // Dispara no documento conforme o hook useKeyPress
        fireEvent.keyDown(document, { key: '?', code: 'Quote' })

        await waitFor(() => {
            expect(screen.getByText('Atalhos de Teclado')).toBeDefined()
        }, { timeout: 2000 })
    })

    it('deve chamar o update do supabase ao clicar em Iniciar Preparo', async () => {
        render(<PainelCozinhaClient pedidosIniciais={mockPedidos} />)
        const btn = screen.getByText('Iniciar Preparo')
        fireEvent.click(btn)

        expect(mockSupabase.from).toHaveBeenCalledWith('pedidos')
    })
})
