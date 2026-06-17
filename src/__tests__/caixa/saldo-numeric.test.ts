/**
 * Regressão do BUG do REFORÇO de caixa + blindagem numérica do caixa.
 *
 * Causa raiz: o Supabase/PostgREST devolve `numeric` (ex.: caixa.saldo) como
 * STRING. O reforço fazia `saldo + valor`; com `saldo` string, o `+` vira
 * CONCATENAÇÃO ("171.11" + 61.9 = "171.1161.9"), gerando um numeric inválido
 * que o Postgres rejeitava. A sangria escapava porque `-` coage pra número.
 *
 * Estes testes travam:
 *  - o comportamento de `toNum` (coerção segura);
 *  - a matemática de saldo (reforço/sangria) com saldo vindo como STRING;
 *  - a garantia de que o saldo resultante é um numeric VÁLIDO (1 ponto decimal).
 */

import { describe, it, expect } from 'vitest'
import { toNum } from '@/lib/num'
import { round2 } from '@/lib/desconto'

// ─── Espelho puro da lógica de saldo do CaixaClient (handleMovimentacao) ─────
// `saldoRaw` simula o que vem do banco (pode ser string OU number).
function calcularNovoSaldo(
    tipo: 'sangria' | 'reforco',
    saldoRaw: unknown,
    valor: number,
): number {
    const saldoReal = toNum(saldoRaw)
    return round2(tipo === 'sangria' ? saldoReal - valor : saldoReal + valor)
}

/** Um saldo é gravável como numeric se vira string com no máximo 1 ponto. */
function ehNumericValido(v: number): boolean {
    const s = String(v)
    return Number.isFinite(v) && (s.match(/\./g)?.length ?? 0) <= 1 && !Number.isNaN(Number(s))
}

describe('toNum — coerção numérica do banco', () => {
    it('mantém números finitos', () => {
        expect(toNum(233.01)).toBe(233.01)
        expect(toNum(0)).toBe(0)
        expect(toNum(-5)).toBe(-5)
    })

    it('converte string numérica do PostgREST (ponto decimal)', () => {
        expect(toNum('171.11')).toBe(171.11)
        expect(toNum('0.00')).toBe(0)
        expect(toNum('1000')).toBe(1000)
    })

    it('aceita vírgula decimal pt-BR defensivamente', () => {
        expect(toNum('171,11')).toBe(171.11)
    })

    it('retorna 0 (nunca NaN) para nulo/vazio/lixo', () => {
        expect(toNum(null)).toBe(0)
        expect(toNum(undefined)).toBe(0)
        expect(toNum('')).toBe(0)
        expect(toNum('   ')).toBe(0)
        expect(toNum('abc')).toBe(0)
        expect(toNum(NaN)).toBe(0)
        expect(toNum(Infinity)).toBe(0)
    })

    it('aceita fallback customizado', () => {
        expect(toNum(null, 10)).toBe(10)
        expect(toNum('x', -1)).toBe(-1)
    })
})

describe('REGRESSÃO — reforço com saldo vindo como STRING (o bug)', () => {
    it('demonstra a falha do `+` cru: string + number concatena (numeric inválido)', () => {
        // saldoString tipado como string DE PROPÓSITO: é o que o runtime via,
        // mesmo o tipo gerado dizendo `number`. `string + number` compila e
        // concatena — exatamente a armadilha silenciosa.
        const saldoString: string = '171.11'   // como o PostgREST devolve
        const valor = 61.9
        const resultadoAntigo = saldoString + valor
        expect(resultadoAntigo).toBe('171.1161.9')        // concatenou
        expect(ehNumericValido(resultadoAntigo as unknown as number)).toBe(false) // 2 pontos → inválido
        expect(Number(resultadoAntigo)).toBeNaN()
    })

    it('com o fix (toNum + round2) gera saldo correto e numeric válido', () => {
        const novo = calcularNovoSaldo('reforco', '171.11', 61.9)
        expect(novo).toBe(233.01)                 // 171.11 + 61.90
        expect(ehNumericValido(novo)).toBe(true)  // gravável sem erro
    })

    it('reforço a partir de caixa recém-aberto (saldo "0.00")', () => {
        const novo = calcularNovoSaldo('reforco', '0.00', 50)
        expect(novo).toBe(50)
        expect(ehNumericValido(novo)).toBe(true)
    })

    it('reforço com saldo já numérico continua certo (não regride)', () => {
        expect(calcularNovoSaldo('reforco', 233.01, 100)).toBe(333.01)
    })

    it('reforço com centavos não acumula ruído de float', () => {
        // 0.1 + 0.2 = 0.30000000000000004 sem round2
        expect(calcularNovoSaldo('reforco', '0.1', 0.2)).toBe(0.3)
    })
})

describe('SANGRIA — continua correta com saldo string', () => {
    it('subtrai certo (o `-` já coagia, mas garantimos)', () => {
        expect(calcularNovoSaldo('sangria', '233.01', 33.01)).toBe(200)
        expect(ehNumericValido(calcularNovoSaldo('sangria', '233.01', 33.01))).toBe(true)
    })

    it('comparação de saldo insuficiente usa números (não string)', () => {
        const saldoReal = toNum('100.00')
        const valor = 150
        expect(valor > saldoReal).toBe(true)   // 150 > 100, bloqueia
    })
})

describe('Soma de totais de conta (multi-pedido) com totais string', () => {
    it('somar p.total string concatenava; com toNum vira número', () => {
        const totaisDoBanco = ['26.03', '13.80', '8.59'] // 3 pedidos da mesma mesa
        const total = totaisDoBanco.reduce((s, t) => round2(s + toNum(t)), 0)
        expect(total).toBe(48.42)
        expect(ehNumericValido(total)).toBe(true)
    })
})
