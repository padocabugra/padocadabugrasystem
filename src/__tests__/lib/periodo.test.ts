/**
 * Testes dos períodos de MÊS FECHADO usados nos relatórios (atalhos "Este mês"
 * / "Mês passado" e o nome do arquivo do Pacote da Contabilidade).
 *
 * O risco aqui é data: virada de ano, fevereiro (bissexto ou não) e meses de
 * 30/31 dias. `hojeYMD` é injetado para o teste não depender do dia real.
 */

import { describe, it, expect } from 'vitest'
import { mesFechado, rotuloPeriodoArquivo } from '@/lib/periodo'

describe('mesFechado', () => {
    it('este mês (offset 0) vai do dia 1 ao último dia', () => {
        expect(mesFechado(0, '2026-07-24')).toEqual({
            inicio: '2026-07-01', fim: '2026-07-31', rotulo: 'julho-2026',
        })
    })

    it('mês passado (offset -1) respeita mês de 30 dias', () => {
        expect(mesFechado(-1, '2026-07-24')).toEqual({
            inicio: '2026-06-01', fim: '2026-06-30', rotulo: 'junho-2026',
        })
    })

    it('vira o ano corretamente (janeiro → dezembro anterior)', () => {
        expect(mesFechado(-1, '2026-01-15')).toEqual({
            inicio: '2025-12-01', fim: '2025-12-31', rotulo: 'dezembro-2025',
        })
    })

    it('fevereiro de ano bissexto tem 29 dias', () => {
        expect(mesFechado(0, '2028-02-10').fim).toBe('2028-02-29')
    })

    it('fevereiro de ano comum tem 28 dias', () => {
        expect(mesFechado(0, '2026-02-10').fim).toBe('2026-02-28')
    })

    it('funciona a partir do último dia do mês (sem transbordar)', () => {
        // 31/03: o mês passado é fevereiro (28 dias) — o clássico bug de
        // setMonth(-1) devolveria 03/03.
        expect(mesFechado(-1, '2026-03-31')).toEqual({
            inicio: '2026-02-01', fim: '2026-02-28', rotulo: 'fevereiro-2026',
        })
    })

    it('offset mais fundo (-12) volta um ano inteiro', () => {
        expect(mesFechado(-12, '2026-07-24').rotulo).toBe('julho-2025')
    })
})

describe('rotuloPeriodoArquivo', () => {
    it('intervalo que é exatamente um mês fechado vira o nome do mês', () => {
        expect(rotuloPeriodoArquivo('2026-06-01', '2026-06-30', '2026-07-24')).toBe('junho-2026')
    })

    it('mês fechado antigo (dentro de 12 meses) também é reconhecido', () => {
        expect(rotuloPeriodoArquivo('2025-12-01', '2025-12-31', '2026-07-24')).toBe('dezembro-2025')
    })

    it('intervalo parcial cai nas datas cruas', () => {
        expect(rotuloPeriodoArquivo('2026-07-01', '2026-07-15', '2026-07-24')).toBe('2026-07-01_a_2026-07-15')
    })

    it('mês fechado fora da janela de 12 meses cai nas datas cruas', () => {
        expect(rotuloPeriodoArquivo('2020-01-01', '2020-01-31', '2026-07-24')).toBe('2020-01-01_a_2020-01-31')
    })
})
