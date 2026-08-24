/**
 * Testes das regras de despesas (custos fixos).
 *
 * O que realmente pode dar errado aqui: (1) navegação entre meses virando o ano,
 * (2) o "Repetir mês anterior" duplicar despesas se clicado duas vezes, e
 * (3) totais errados porque o Supabase devolve numeric como string.
 */

import { describe, it, expect } from 'vitest'
import {
    resumirDespesas,
    despesasParaCopiar,
    navegarCompetencia,
    competenciaLabel,
    competenciaAtual,
    labelCategoria,
    type Despesa,
} from '@/lib/despesas'

const d = (over: Partial<Despesa>): Despesa => ({
    id: Math.random().toString(36).slice(2),
    competencia: '2026-08-01',
    categoria: 'outros',
    descricao: 'x',
    valor: 10,
    pago: false,
    vencimento: null,
    observacao: null,
    ...over,
})

describe('resumirDespesas', () => {
    const lista = [
        d({ categoria: 'funcionarios', descricao: 'Maria', valor: '1800.00', pago: true }),
        d({ categoria: 'funcionarios', descricao: 'João', valor: 1500 }),
        d({ categoria: 'aluguel', descricao: 'Ponto', valor: 3000, pago: true }),
        d({ categoria: 'energia', descricao: 'Luz', valor: '742.35' }),
    ]

    it('soma o total mesmo com numeric vindo como string', () => {
        expect(resumirDespesas(lista).total).toBeCloseTo(7042.35, 2)
    })

    it('separa pago de em aberto', () => {
        const r = resumirDespesas(lista)
        expect(r.totalPago).toBeCloseTo(4800, 2)
        expect(r.totalAberto).toBeCloseTo(2242.35, 2)
        expect(r.totalPago + r.totalAberto).toBeCloseTo(r.total, 2)
    })

    it('agrupa por categoria somando os funcionários', () => {
        const func = resumirDespesas(lista).porCategoria.find((c) => c.categoria === 'funcionarios')
        expect(func).toMatchObject({ qtd: 2, valor: 3300 })
    })

    it('não lista categorias sem lançamento', () => {
        const cats = resumirDespesas(lista).porCategoria.map((c) => c.categoria)
        expect(cats).toEqual(['funcionarios', 'aluguel', 'energia'])
        expect(cats).not.toContain('gas')
    })

    it('lista vazia zera tudo sem quebrar', () => {
        expect(resumirDespesas([])).toEqual({ total: 0, totalPago: 0, totalAberto: 0, qtd: 0, porCategoria: [] })
    })
})

describe('navegarCompetencia', () => {
    it('anda para o mês anterior e para o próximo', () => {
        expect(navegarCompetencia('2026-08-01', -1)).toBe('2026-07-01')
        expect(navegarCompetencia('2026-08-01', 1)).toBe('2026-09-01')
    })

    it('vira o ano nos dois sentidos', () => {
        expect(navegarCompetencia('2026-01-01', -1)).toBe('2025-12-01')
        expect(navegarCompetencia('2026-12-01', 1)).toBe('2027-01-01')
    })

    it('aguenta saltos de vários meses', () => {
        expect(navegarCompetencia('2026-03-01', -6)).toBe('2025-09-01')
        expect(navegarCompetencia('2026-08-01', 12)).toBe('2027-08-01')
    })
})

describe('competenciaLabel / competenciaAtual', () => {
    it('formata o mês em português com inicial maiúscula', () => {
        expect(competenciaLabel('2026-08-01')).toBe('Agosto/2026')
        expect(competenciaLabel('2026-01-01')).toBe('Janeiro/2026')
    })

    it('competência atual é sempre o dia 1 do mês de hoje', () => {
        expect(competenciaAtual('2026-08-17')).toBe('2026-08-01')
    })
})

describe('despesasParaCopiar (botão "Repetir mês anterior")', () => {
    const anterior = [
        d({ competencia: '2026-07-01', categoria: 'aluguel', descricao: 'Ponto', valor: 3000, pago: true }),
        d({ competencia: '2026-07-01', categoria: 'funcionarios', descricao: 'Maria', valor: 1800, pago: true }),
        d({ competencia: '2026-07-01', categoria: 'energia', descricao: 'Luz', valor: 700, pago: true }),
    ]

    it('mês atual vazio: copia todas', () => {
        expect(despesasParaCopiar(anterior, [])).toHaveLength(3)
    })

    it('NÃO duplica o que já foi lançado no mês (clicar 2x é seguro)', () => {
        const jaLancadas = [d({ categoria: 'aluguel', descricao: 'Ponto', valor: 3000 })]
        const copiar = despesasParaCopiar(anterior, jaLancadas)
        expect(copiar.map((c) => c.descricao)).toEqual(['Maria', 'Luz'])
    })

    it('ignora diferença de caixa e espaços na descrição', () => {
        const jaLancadas = [d({ categoria: 'funcionarios', descricao: '  maria  ' })]
        const copiar = despesasParaCopiar(anterior, jaLancadas)
        expect(copiar.map((c) => c.descricao)).not.toContain('Maria')
    })

    it('mesma descrição em categoria diferente NÃO é considerada duplicata', () => {
        const jaLancadas = [d({ categoria: 'outros', descricao: 'Ponto' })]
        expect(despesasParaCopiar(anterior, jaLancadas)).toHaveLength(3)
    })

    it('copia o valor mas nunca marca como pago (campo nem é copiado)', () => {
        const copia = despesasParaCopiar(anterior, [])[0]
        expect(copia.valor).toBe(3000)
        expect('pago' in copia).toBe(false)
    })
})

describe('labelCategoria', () => {
    it('traduz o código para o nome exibido', () => {
        expect(labelCategoria('funcionarios')).toBe('Funcionários')
        expect(labelCategoria('agua')).toBe('Água')
    })
})
