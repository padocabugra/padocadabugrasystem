/**
 * Testes do parser da chave de acesso NFC-e e da montagem do relatório de notas
 * para a contabilidade. Garante que Número e Série saem corretos da chave de 44
 * dígitos (sem precisar de colunas extras) e que os totais batem.
 */

import { describe, it, expect } from 'vitest'
import {
    parseChaveNFCe,
    numeroNotaFromChave,
    serieNotaFromChave,
    montarLinhasNotas,
    type NotaFiscalRaw,
} from '@/lib/chave-nfce'

// Chave montada com campos conhecidos:
// cUF=50 AAMM=2607 CNPJ=12345678000199 mod=65 série=001 nNF=000000123
// tpEmis=1 cNF=00000000 cDV=0  → série "1", número "123".
const CHAVE_OK = '50260712345678000199650010000001231000000000'

describe('parseChaveNFCe', () => {
    it('extrai os campos posicionais corretos', () => {
        expect(CHAVE_OK.length).toBe(44)
        const p = parseChaveNFCe(CHAVE_OK)
        expect(p).not.toBeNull()
        expect(p!.uf).toBe('50')
        expect(p!.aamm).toBe('2607')
        expect(p!.cnpj).toBe('12345678000199')
        expect(p!.modelo).toBe('65')
        expect(p!.serie).toBe('001')
        expect(p!.numero).toBe('000000123')
    })

    it('aceita chave com máscara (só conta os dígitos)', () => {
        const comEspacos = CHAVE_OK.replace(/(\d{4})/g, '$1 ').trim()
        expect(parseChaveNFCe(comEspacos)?.numero).toBe('000000123')
    })

    it('retorna null para chave inválida (nula, vazia ou tamanho errado)', () => {
        expect(parseChaveNFCe(null)).toBeNull()
        expect(parseChaveNFCe(undefined)).toBeNull()
        expect(parseChaveNFCe('')).toBeNull()
        expect(parseChaveNFCe('123')).toBeNull()
        expect(parseChaveNFCe('5'.repeat(43))).toBeNull()
        expect(parseChaveNFCe('5'.repeat(45))).toBeNull()
    })
})

describe('numeroNotaFromChave / serieNotaFromChave', () => {
    it('remove zeros à esquerda de número e série', () => {
        expect(numeroNotaFromChave(CHAVE_OK)).toBe('123')
        expect(serieNotaFromChave(CHAVE_OK)).toBe('1')
    })

    it('devolve "—" quando a chave é inválida', () => {
        expect(numeroNotaFromChave(null)).toBe('—')
        expect(serieNotaFromChave('abc')).toBe('—')
    })
})

describe('montarLinhasNotas', () => {
    const notas: NotaFiscalRaw[] = [
        { id: 'a', created_at: '2026-07-10T14:30:00-04:00', chave_nfce: CHAVE_OK, total: 25.5, nfce_status: 'emitida' },
        // total como string (numeric do Supabase costuma vir string)
        { id: 'b', created_at: '2026-07-11T09:00:00-04:00', chave_nfce: CHAVE_OK, total: '10.00', nfce_status: 'emitida' },
        // sem chave: número/série viram "—" mas ainda soma o valor
        { id: 'c', created_at: '2026-07-12T18:00:00-04:00', chave_nfce: null, total: 4.5, nfce_status: 'emitida' },
    ]

    it('soma o valor total e conta as notas', () => {
        const r = montarLinhasNotas(notas)
        expect(r.quantidade).toBe(3)
        expect(r.total).toBeCloseTo(40, 2)
    })

    it('deriva número/série e traduz a situação', () => {
        const r = montarLinhasNotas(notas)
        expect(r.linhas[0].numero).toBe('123')
        expect(r.linhas[0].serie).toBe('1')
        expect(r.linhas[0].situacao).toBe('Autorizada')
        expect(r.linhas[0].data).not.toBe('—')
        // nota sem chave
        expect(r.linhas[2].numero).toBe('—')
        expect(r.linhas[2].chave).toBe('—')
        expect(r.linhas[2].valor).toBe(4.5)
    })

    it('lista vazia → zero notas e total zero', () => {
        expect(montarLinhasNotas([])).toEqual({ linhas: [], total: 0, quantidade: 0 })
    })
})
