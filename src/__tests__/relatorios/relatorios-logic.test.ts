/**
 * Tests for the Relatórios page business logic.
 *
 * These mirror computations done in useMemo hooks within RelatoriosPage:
 * - resumoVendas aggregation
 * - Curva ABC classification
 * - Auditoria Caixa discrepancy
 * - startY calculation for PDF (export-utils)
 * - dateRange helpers
 */

import { describe, it, expect } from 'vitest'

// ─── Helpers mirroring RelatoriosPage logic ───────────────────────────────────

interface MetricaVenda {
    total_faturado: number
    total_custo: number
    qtd_vendas: number
    receita_dinheiro: number
    receita_pix: number
    receita_debito: number
    receita_credito: number
    ticket_medio: number
    margem_pct: number
}

function calcResumoVendas(metricasVendas: MetricaVenda[]) {
    const totalFat = metricasVendas.reduce((s, m) => s + Number(m.total_faturado), 0)
    const totalCusto = metricasVendas.reduce((s, m) => s + Number(m.total_custo), 0)
    const totalVendas = metricasVendas.reduce((s, m) => s + Number(m.qtd_vendas), 0)
    const ticketMedio = totalVendas > 0 ? totalFat / totalVendas : 0
    const margem = totalFat > 0 ? ((totalFat - totalCusto) / totalFat) * 100 : 0
    const dinheiro = metricasVendas.reduce((s, m) => s + Number(m.receita_dinheiro), 0)
    const pix = metricasVendas.reduce((s, m) => s + Number(m.receita_pix), 0)
    const debito = metricasVendas.reduce((s, m) => s + Number(m.receita_debito), 0)
    const credito = metricasVendas.reduce((s, m) => s + Number(m.receita_credito), 0)
    return { totalFat, totalCusto, totalVendas, ticketMedio, margem, dinheiro, pix, debito, credito }
}

function classifyCurva(pctAcumulado: number): 'A' | 'B' | 'C' {
    if (pctAcumulado <= 80) return 'A'
    if (pctAcumulado <= 95) return 'B'
    return 'C'
}

function calcAuditoriaDiferenca(
    valorAbertura: number,
    vendasDinheiro: number,
    totalReforcos: number,
    totalSangrias: number,
    saldoRegistrado: number
): number {
    const esperado = valorAbertura + vendasDinheiro + totalReforcos - totalSangrias
    return saldoRegistrado - esperado
}

function calcStartY(hasSubtitle: boolean, hasPeriodo: boolean): number {
    if (hasSubtitle) return 38
    if (hasPeriodo) return 33
    return 28
}

function formatDateISO(d: Date): string {
    return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────────────────
// calcResumoVendas
// ─────────────────────────────────────────────────────────────────────────────

describe('calcResumoVendas', () => {
    it('should return all zeros for empty dataset', () => {
        const r = calcResumoVendas([])
        expect(r.totalFat).toBe(0)
        expect(r.totalCusto).toBe(0)
        expect(r.totalVendas).toBe(0)
        expect(r.ticketMedio).toBe(0)
        expect(r.margem).toBe(0)
    })

    it('should correctly sum faturamento across days', () => {
        const data: MetricaVenda[] = [
            { total_faturado: 100, total_custo: 40, qtd_vendas: 5, receita_dinheiro: 60, receita_pix: 40, receita_debito: 0, receita_credito: 0, ticket_medio: 20, margem_pct: 60 },
            { total_faturado: 200, total_custo: 80, qtd_vendas: 10, receita_dinheiro: 100, receita_pix: 100, receita_debito: 0, receita_credito: 0, ticket_medio: 20, margem_pct: 60 },
        ]
        const r = calcResumoVendas(data)
        expect(r.totalFat).toBe(300)
        expect(r.totalCusto).toBe(120)
        expect(r.totalVendas).toBe(15)
    })

    it('should calculate ticket medio correctly', () => {
        const data: MetricaVenda[] = [
            { total_faturado: 150, total_custo: 60, qtd_vendas: 3, receita_dinheiro: 150, receita_pix: 0, receita_debito: 0, receita_credito: 0, ticket_medio: 50, margem_pct: 60 },
        ]
        const r = calcResumoVendas(data)
        expect(r.ticketMedio).toBe(50) // 150 / 3
    })

    it('should calculate gross margin percentage correctly', () => {
        const data: MetricaVenda[] = [
            { total_faturado: 100, total_custo: 30, qtd_vendas: 1, receita_dinheiro: 100, receita_pix: 0, receita_debito: 0, receita_credito: 0, ticket_medio: 100, margem_pct: 70 },
        ]
        const r = calcResumoVendas(data)
        expect(r.margem).toBe(70) // (100 - 30) / 100 * 100
    })

    it('should correctly split payment methods', () => {
        const data: MetricaVenda[] = [
            { total_faturado: 200, total_custo: 80, qtd_vendas: 4, receita_dinheiro: 50, receita_pix: 80, receita_debito: 40, receita_credito: 30, ticket_medio: 50, margem_pct: 60 },
        ]
        const r = calcResumoVendas(data)
        expect(r.dinheiro).toBe(50)
        expect(r.pix).toBe(80)
        expect(r.debito).toBe(40)
        expect(r.credito).toBe(30)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyCurva
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyCurva (ABC classification)', () => {
    it('should classify product as A when pctAcumulado <= 80%', () => {
        expect(classifyCurva(0)).toBe('A')
        expect(classifyCurva(50)).toBe('A')
        expect(classifyCurva(80)).toBe('A')
    })

    it('should classify product as B when pctAcumulado between 81% and 95%', () => {
        expect(classifyCurva(81)).toBe('B')
        expect(classifyCurva(90)).toBe('B')
        expect(classifyCurva(95)).toBe('B')
    })

    it('should classify product as C when pctAcumulado > 95%', () => {
        expect(classifyCurva(96)).toBe('C')
        expect(classifyCurva(100)).toBe('C')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// calcAuditoriaDiferenca
// ─────────────────────────────────────────────────────────────────────────────

describe('calcAuditoriaDiferenca', () => {
    it('should return 0 when registered balance matches expected', () => {
        // Expected: 200 + 300 + 0 - 0 = 500; Registered: 500
        expect(calcAuditoriaDiferenca(200, 300, 0, 0, 500)).toBe(0)
    })

    it('should return positive value when registered > expected (sobra)', () => {
        // Expected: 200 + 300 - 50 + 0 = 450; Registered: 500 → diferença = +50
        expect(calcAuditoriaDiferenca(200, 300, 0, 50, 500)).toBe(50)
    })

    it('should return negative value when registered < expected (falta)', () => {
        // Expected: 100 + 200 + 0 - 0 = 300; Registered: 250 → diferença = -50
        expect(calcAuditoriaDiferenca(100, 200, 0, 0, 250)).toBe(-50)
    })

    it('should factor reforço (add) and sangria (subtract) correctly', () => {
        // Expected: 100 (abertura) + 200 (vendas) + 50 (reforço) - 30 (sangria) = 320
        // Registered: 320 → diferença = 0
        expect(calcAuditoriaDiferenca(100, 200, 50, 30, 320)).toBe(0)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// calcStartY (PDF layout logic from export-utils)
// ─────────────────────────────────────────────────────────────────────────────

describe('calcStartY (PDF table startY)', () => {
    it('should return 38 when subtitle is present (subtitle takes most space)', () => {
        expect(calcStartY(true, true)).toBe(38)
        expect(calcStartY(true, false)).toBe(38)
    })

    it('should return 33 when only periodo is present', () => {
        expect(calcStartY(false, true)).toBe(33)
    })

    it('should return 28 when neither subtitle nor periodo', () => {
        expect(calcStartY(false, false)).toBe(28)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatDateISO (date range picker helper)
// ─────────────────────────────────────────────────────────────────────────────

describe('formatDateISO', () => {
    it('should format date as YYYY-MM-DD', () => {
        const d = new Date('2025-03-15T12:00:00Z')
        expect(formatDateISO(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('should produce correct date string', () => {
        const d = new Date('2025-01-05T00:00:00Z')
        expect(formatDateISO(d)).toBe('2025-01-05')
    })
})
