/**
 * Tests for the business logic extracted from InventarioPage.
 *
 * The functions `calculateDivergencias`, `filterProdutos`, and
 * `buildMovimentacaoObservacao` mirror the exact logic in the component
 * so we can test them in isolation without mounting React.
 */

import { describe, it, expect } from 'vitest'
import type { Produto } from '@/lib/types/produto'

// ─── Helpers extracted from InventarioPage (pure-function clones) ─────────────

type ContagemMap = Record<string, string>

interface Divergencia {
    produto: Produto
    contagem: number
    diferenca: number
}

function parseContagem(raw: string): number | null {
    if (raw === '' || raw === undefined) return null
    const v = parseFloat(raw.replace(',', '.'))
    return isNaN(v) ? null : v
}

function calculateDivergencias(produtos: Produto[], contagens: ContagemMap): Divergencia[] {
    const result: Divergencia[] = []
    for (const produto of produtos) {
        const raw = contagens[produto.id]
        const contagem = parseContagem(raw ?? '')
        if (contagem === null) continue
        const diferenca = contagem - Number(produto.estoque_atual)
        if (diferenca !== 0) {
            result.push({ produto, contagem, diferenca })
        }
    }
    return result
}

function filterProdutos(
    produtos: Produto[],
    busca: string,
    filtroDiv: 'todos' | 'divergentes',
    divergencias: Divergencia[]
): Produto[] {
    let lista = produtos
    if (busca) {
        const termo = busca.toLowerCase()
        lista = lista.filter(
            (p) => p.nome.toLowerCase().includes(termo) || p.categoria.toLowerCase().includes(termo)
        )
    }
    if (filtroDiv === 'divergentes') {
        const ids = new Set(divergencias.map((d) => d.produto.id))
        lista = lista.filter((p) => ids.has(p.id))
    }
    return lista
}

function buildMovimentacaoObservacao(
    estoqueAtual: number,
    novaContagem: number,
    diferenca: number
): string {
    const sign = diferenca > 0 ? '+' : ''
    return `Inventário: ${estoqueAtual} → ${novaContagem} (${sign}${diferenca})`
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeProduto(overrides: Partial<Produto> = {}): Produto {
    return {
        id: 'prod-1',
        nome: 'Pão Francês',
        categoria: 'Pães',
        tipo: 'proprio',
        preco: 0.75,
        custo: 0.3,
        estoque_atual: 100,
        estoque_minimo: 10,
        unidade_medida: 'un',
        ativo: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        ...overrides,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// parseContagem
// ─────────────────────────────────────────────────────────────────────────────

describe('parseContagem', () => {
    it('should parse integer string to number', () => {
        expect(parseContagem('80')).toBe(80)
    })

    it('should parse decimal with dot', () => {
        expect(parseContagem('10.5')).toBe(10.5)
    })

    it('should parse decimal with comma (Brazilian format)', () => {
        expect(parseContagem('10,5')).toBe(10.5)
    })

    it('should return null for empty string', () => {
        expect(parseContagem('')).toBeNull()
    })

    it('should return null for non-numeric string', () => {
        expect(parseContagem('abc')).toBeNull()
    })

    it('should parse zero as a valid contagem', () => {
        expect(parseContagem('0')).toBe(0)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateDivergencias
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateDivergencias', () => {
    it('should return empty array when no contagens are provided', () => {
        const produtos = [makeProduto()]
        expect(calculateDivergencias(produtos, {})).toHaveLength(0)
    })

    it('should return empty array when contagem equals estoque_atual (no divergence)', () => {
        const p = makeProduto({ estoque_atual: 50 })
        expect(calculateDivergencias([p], { 'prod-1': '50' })).toHaveLength(0)
    })

    it('should detect negative divergence (physical < system)', () => {
        const p = makeProduto({ estoque_atual: 100 })
        const result = calculateDivergencias([p], { 'prod-1': '80' })
        expect(result).toHaveLength(1)
        expect(result[0].diferenca).toBe(-20)
        expect(result[0].contagem).toBe(80)
    })

    it('should detect positive divergence (physical > system)', () => {
        const p = makeProduto({ estoque_atual: 100 })
        const result = calculateDivergencias([p], { 'prod-1': '120' })
        expect(result[0].diferenca).toBe(20)
    })

    it('should skip products with empty or invalid contagem', () => {
        const p1 = makeProduto({ id: 'p1', estoque_atual: 10 })
        const p2 = makeProduto({ id: 'p2', estoque_atual: 20 })
        const result = calculateDivergencias([p1, p2], { 'p1': '', 'p2': 'abc' })
        expect(result).toHaveLength(0)
    })

    it('should handle multiple products with mixed divergencias', () => {
        const p1 = makeProduto({ id: 'p1', estoque_atual: 10 })
        const p2 = makeProduto({ id: 'p2', estoque_atual: 20 })
        const p3 = makeProduto({ id: 'p3', estoque_atual: 30 })
        const result = calculateDivergencias(
            [p1, p2, p3],
            { 'p1': '5', 'p2': '20', 'p3': '35' }
        )
        // p2 has no divergence; p1 and p3 do
        expect(result).toHaveLength(2)
        expect(result.find((r) => r.produto.id === 'p1')?.diferenca).toBe(-5)
        expect(result.find((r) => r.produto.id === 'p3')?.diferenca).toBe(5)
    })

    it('should parse comma-decimal contagem correctly in divergence calculation', () => {
        const p = makeProduto({ estoque_atual: 10.5 })
        const result = calculateDivergencias([p], { 'prod-1': '10,5' })
        expect(result).toHaveLength(0) // no divergence
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// filterProdutos
// ─────────────────────────────────────────────────────────────────────────────

describe('filterProdutos', () => {
    const produtos = [
        makeProduto({ id: 'p1', nome: 'Pão Francês', categoria: 'Pães' }),
        makeProduto({ id: 'p2', nome: 'Croissant', categoria: 'Pães' }),
        makeProduto({ id: 'p3', nome: 'Café Expresso', categoria: 'Bebidas' }),
    ]

    it('should return all products when no filters applied', () => {
        expect(filterProdutos(produtos, '', 'todos', [])).toHaveLength(3)
    })

    it('should filter by name (case-insensitive)', () => {
        const result = filterProdutos(produtos, 'pão', 'todos', [])
        expect(result).toHaveLength(1)
        expect(result[0].nome).toBe('Pão Francês')
    })

    it('should filter by categoria (case-insensitive)', () => {
        const result = filterProdutos(produtos, 'bebidas', 'todos', [])
        expect(result).toHaveLength(1)
        expect(result[0].nome).toBe('Café Expresso')
    })

    it('should filter by partial name match', () => {
        const result = filterProdutos(produtos, 'café', 'todos', [])
        expect(result).toHaveLength(1)
    })

    it('should return empty array when no products match search', () => {
        expect(filterProdutos(produtos, 'pizza', 'todos', [])).toHaveLength(0)
    })

    it('should filter only divergentes when filtro is divergentes', () => {
        const divergencias = [
            { produto: produtos[0], contagem: 50, diferenca: -50 },
        ]
        const result = filterProdutos(produtos, '', 'divergentes', divergencias)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('p1')
    })

    it('should combine busca and divergentes filter', () => {
        const divergencias = [
            { produto: produtos[0], contagem: 50, diferenca: -50 },
            { produto: produtos[1], contagem: 10, diferenca: -5 },
        ]
        // Search for "pão" within divergentes – only p1 matches
        const result = filterProdutos(produtos, 'pão', 'divergentes', divergencias)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('p1')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildMovimentacaoObservacao
// ─────────────────────────────────────────────────────────────────────────────

describe('buildMovimentacaoObservacao', () => {
    it('should build correct message for negative divergence (loss)', () => {
        const obs = buildMovimentacaoObservacao(100, 80, -20)
        expect(obs).toBe('Inventário: 100 → 80 (-20)')
    })

    it('should build correct message for positive divergence (gain) with + sign', () => {
        const obs = buildMovimentacaoObservacao(50, 70, 20)
        expect(obs).toBe('Inventário: 50 → 70 (+20)')
    })

    it('should not add + sign for zero difference', () => {
        const obs = buildMovimentacaoObservacao(30, 30, 0)
        expect(obs).toBe('Inventário: 30 → 30 (0)')
    })
})
