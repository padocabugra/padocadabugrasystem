/**
 * Tests for discount math (src/lib/desconto.ts).
 *
 * These guarantee the money calculations are exact — the discount value is
 * always sane, and the per-item / per-order split sums back to the exact
 * discount with no lost cents (critical for the NFC-e total to match SEFAZ).
 */

import { describe, it, expect } from 'vitest'
import {
    round2,
    calcularValorDesconto,
    percentualDoDesconto,
    distribuirDesconto,
} from '@/lib/desconto'

describe('round2', () => {
    it('rounds to 2 decimals', () => {
        expect(round2(1.005)).toBe(1.01)
        expect(round2(0.1 + 0.2)).toBe(0.3)
        expect(round2(10)).toBe(10)
    })
})

describe('calcularValorDesconto', () => {
    it('returns the value itself for "valor" mode', () => {
        expect(calcularValorDesconto('valor', 5, 100)).toBe(5)
        expect(calcularValorDesconto('valor', 12.5, 100)).toBe(12.5)
    })

    it('computes percentage over the gross total', () => {
        expect(calcularValorDesconto('percentual', 10, 100)).toBe(10)
        expect(calcularValorDesconto('percentual', 15, 80)).toBe(12)
        expect(calcularValorDesconto('percentual', 5, 33.33)).toBe(1.67) // round
    })

    it('never exceeds the gross total', () => {
        expect(calcularValorDesconto('valor', 999, 50)).toBe(50)
        expect(calcularValorDesconto('percentual', 150, 50)).toBe(50)
    })

    it('never returns negative / handles invalid input', () => {
        expect(calcularValorDesconto('valor', -5, 100)).toBe(0)
        expect(calcularValorDesconto('valor', 0, 100)).toBe(0)
        expect(calcularValorDesconto('percentual', 10, 0)).toBe(0)
        expect(calcularValorDesconto('valor', NaN, 100)).toBe(0)
    })
})

describe('percentualDoDesconto', () => {
    it('computes the percentage a discount represents', () => {
        expect(percentualDoDesconto(10, 100)).toBe(10)
        expect(percentualDoDesconto(12, 80)).toBe(15)
        expect(percentualDoDesconto(0, 100)).toBe(0)
        expect(percentualDoDesconto(5, 0)).toBe(0)
    })
})

describe('distribuirDesconto', () => {
    it('splits proportionally to the weights', () => {
        expect(distribuirDesconto(10, [50, 50])).toEqual([5, 5])
        expect(distribuirDesconto(10, [75, 25])).toEqual([7.5, 2.5])
    })

    it('sum of shares equals the discount exactly (no lost cents)', () => {
        const pesos = [10, 10, 10]
        const shares = distribuirDesconto(10, pesos)
        const soma = round2(shares.reduce((s, v) => s + v, 0))
        expect(soma).toBe(10)
    })

    it('handles ugly rounding (1/3 split) and still sums exactly', () => {
        const shares = distribuirDesconto(1, [1, 1, 1])
        expect(round2(shares.reduce((s, v) => s + v, 0))).toBe(1)
    })

    it('puts the rounding remainder on the largest weight', () => {
        // 0.10 over [70,15,15] → 0.07 / 0.015→0.02 / 0.015→0.02 = 0.11 (over),
        // remainder is corrected on the largest parcel.
        const shares = distribuirDesconto(0.1, [70, 15, 15])
        expect(round2(shares.reduce((s, v) => s + v, 0))).toBe(0.1)
    })

    it('no single share exceeds its weight', () => {
        const pesos = [1, 1, 98]
        const shares = distribuirDesconto(50, pesos)
        shares.forEach((s, i) => expect(s).toBeLessThanOrEqual(pesos[i]))
        expect(round2(shares.reduce((s, v) => s + v, 0))).toBe(50)
    })

    it('returns zeros for no discount or no weight', () => {
        expect(distribuirDesconto(0, [10, 20])).toEqual([0, 0])
        expect(distribuirDesconto(10, [0, 0])).toEqual([0, 0])
    })

    it('single order/item gets the whole discount', () => {
        expect(distribuirDesconto(7.5, [100])).toEqual([7.5])
    })
})
