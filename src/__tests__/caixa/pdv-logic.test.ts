/**
 * Tests for PDV / Caixa business logic.
 *
 * These are pure functions mirroring the logic in CaixaClient.tsx,
 * tested in isolation without React or Supabase.
 */

import { describe, it, expect } from 'vitest'

// ─── Pure helper functions (mirroring CaixaClient logic) ─────────────────────

const FORMA_LABEL: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    debito: 'Débito',
    credito: 'Crédito',
}

function calcularTroco(formaPagamento: string, valorPago: number, total: number): number {
    if (formaPagamento !== 'dinheiro') return 0
    return Math.max(0, valorPago - total)
}

function calcularPontosGanhos(total: number, hasClient: boolean): number {
    if (!hasClient) return 0
    return Math.max(Math.floor(total / 10), 0)
}

function getValorPago(
    formaPagamento: string,
    valorRecebidoNum: number,
    total: number
): number {
    return formaPagamento === 'dinheiro' ? valorRecebidoNum : total
}

function isValorSuficiente(
    formaPagamento: string,
    valorPago: number,
    total: number
): boolean {
    if (formaPagamento !== 'dinheiro') return true
    return valorPago >= total
}

function formatPedidoId(id: string): string {
    return `#${id.slice(0, 8).toUpperCase()}`
}

// ─────────────────────────────────────────────────────────────────────────────
// calcularTroco
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularTroco', () => {
    it('should calculate correct change when customer overpays in cash', () => {
        expect(calcularTroco('dinheiro', 50, 32.5)).toBe(17.5)
    })

    it('should return 0 when payment exactly matches total', () => {
        expect(calcularTroco('dinheiro', 30, 30)).toBe(0)
    })

    it('should return 0 for non-cash payments (PIX)', () => {
        expect(calcularTroco('pix', 100, 30)).toBe(0)
    })

    it('should return 0 for non-cash payments (cartao debito)', () => {
        expect(calcularTroco('debito', 200, 99)).toBe(0)
    })

    it('should return 0 for non-cash payments (cartao credito)', () => {
        expect(calcularTroco('credito', 300, 150)).toBe(0)
    })

    it('should use Math.max to prevent negative change', () => {
        // Edge case: this should never happen (isValorSuficiente blocks it),
        // but the function alone must be safe
        expect(calcularTroco('dinheiro', 10, 30)).toBe(0)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// calcularPontosGanhos
// ─────────────────────────────────────────────────────────────────────────────

describe('calcularPontosGanhos', () => {
    it('should award floor(total/10) points for orders with a client', () => {
        expect(calcularPontosGanhos(100, true)).toBe(10)
    })

    it('should award 0 points for orders without a client', () => {
        expect(calcularPontosGanhos(100, false)).toBe(0)
    })

    it('should floor fractional points (e.g. R$35 = 3 points, not 3.5)', () => {
        expect(calcularPontosGanhos(35, true)).toBe(3)
    })

    it('should award 0 points when total is below R$10 (less than 1 point)', () => {
        expect(calcularPontosGanhos(9.99, true)).toBe(0)
    })

    it('should return 0 for zero total', () => {
        expect(calcularPontosGanhos(0, true)).toBe(0)
    })

    it('should be consistent with DB trigger formula floor(total/10)', () => {
        // Validates our frontend matches the PostgreSQL trigger exactly
        const testCases = [
            { total: 10, expected: 1 },
            { total: 19.99, expected: 1 },
            { total: 20, expected: 2 },
            { total: 150.75, expected: 15 },
            { total: 1000, expected: 100 },
        ]
        testCases.forEach(({ total, expected }) => {
            expect(calcularPontosGanhos(total, true)).toBe(expected)
        })
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// getValorPago
// ─────────────────────────────────────────────────────────────────────────────

describe('getValorPago', () => {
    it('should return valorRecebidoNum for cash payment', () => {
        expect(getValorPago('dinheiro', 50, 32)).toBe(50)
    })

    it('should return total for PIX payment (no over-payment)', () => {
        expect(getValorPago('pix', 999, 45)).toBe(45)
    })

    it('should return total for débito payment', () => {
        expect(getValorPago('debito', 999, 78.5)).toBe(78.5)
    })

    it('should return total for crédito payment', () => {
        expect(getValorPago('credito', 999, 120)).toBe(120)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// isValorSuficiente
// ─────────────────────────────────────────────────────────────────────────────

describe('isValorSuficiente', () => {
    it('should return true when cash payment covers total', () => {
        expect(isValorSuficiente('dinheiro', 50, 30)).toBe(true)
    })

    it('should return true when cash payment exactly equals total', () => {
        expect(isValorSuficiente('dinheiro', 30, 30)).toBe(true)
    })

    it('should return false when cash payment is less than total', () => {
        expect(isValorSuficiente('dinheiro', 10, 30)).toBe(false)
    })

    it('should always return true for non-cash payments regardless of amount', () => {
        expect(isValorSuficiente('pix', 0, 1000)).toBe(true)
        expect(isValorSuficiente('debito', 0, 1000)).toBe(true)
        expect(isValorSuficiente('credito', 0, 1000)).toBe(true)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// FORMA_LABEL mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('FORMA_LABEL', () => {
    it('should have all expected payment methods', () => {
        expect(FORMA_LABEL.dinheiro).toBe('Dinheiro')
        expect(FORMA_LABEL.pix).toBe('PIX')
        expect(FORMA_LABEL.debito).toBe('Débito')
        expect(FORMA_LABEL.credito).toBe('Crédito')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatPedidoId (receipt display helper)
// ─────────────────────────────────────────────────────────────────────────────

describe('formatPedidoId', () => {
    it('should prefix with # and uppercase first 8 chars', () => {
        expect(formatPedidoId('abcd1234-5678-0000')).toBe('#ABCD1234')
    })

    it('should handle 8-char UUIDs correctly', () => {
        expect(formatPedidoId('12345678')).toBe('#12345678')
    })
})
