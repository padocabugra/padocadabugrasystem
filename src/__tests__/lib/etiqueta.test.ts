import { describe, it, expect } from 'vitest'
import { escolherFormatoBarcode } from '@/lib/etiqueta'

describe('escolherFormatoBarcode', () => {
    it('usa EAN13 para um EAN-13 válido (industrializado)', () => {
        expect(escolherFormatoBarcode('7891000100103')).toBe('EAN13')
    })

    it('usa CODE128 para SKU interno com letras (produto da padoca)', () => {
        expect(escolherFormatoBarcode('PAO-FRA-50')).toBe('CODE128')
    })

    it('usa CODE128 para 13 dígitos com checksum inválido', () => {
        expect(escolherFormatoBarcode('7891000100100')).toBe('CODE128')
    })

    it('usa CODE128 para código numérico curto (não-EAN)', () => {
        expect(escolherFormatoBarcode('12345')).toBe('CODE128')
    })

    it('trata null/undefined/vazio como CODE128 sem quebrar', () => {
        expect(escolherFormatoBarcode(null)).toBe('CODE128')
        expect(escolherFormatoBarcode(undefined)).toBe('CODE128')
        expect(escolherFormatoBarcode('   ')).toBe('CODE128')
    })
})
