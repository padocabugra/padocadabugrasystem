import { describe, it, expect } from 'vitest'
import { gerarPixCopiaECola, crc16, PIX_RECEBEDOR } from '@/lib/pix'

describe('crc16 (CCITT-FALSE)', () => {
    it('bate com o vetor de verificação padrão "123456789" → 29B1', () => {
        // Check value oficial do CRC-16/CCITT-FALSE
        expect(crc16('123456789')).toBe('29B1')
    })

    it('sempre retorna 4 caracteres hex maiúsculos', () => {
        const c = crc16('00020101')
        expect(c).toMatch(/^[0-9A-F]{4}$/)
    })
})

describe('gerarPixCopiaECola', () => {
    it('começa com o Payload Format Indicator 000201', () => {
        const p = gerarPixCopiaECola({ valor: 10 })
        expect(p.startsWith('000201')).toBe(true)
    })

    it('contém o GUI do Pix e a chave (CNPJ) do recebedor', () => {
        const p = gerarPixCopiaECola({ valor: 10 })
        expect(p).toContain('br.gov.bcb.pix')
        expect(p).toContain(PIX_RECEBEDOR.chave)
    })

    it('inclui moeda BRL (5303986) e o valor formatado no campo 54', () => {
        const p = gerarPixCopiaECola({ valor: 12.5 })
        expect(p).toContain('5303986')
        expect(p).toContain('540512.50') // tag 54 + len 05 + "12.50"
    })

    it('o CRC final corresponde ao cálculo sobre o restante do payload', () => {
        const p = gerarPixCopiaECola({ valor: 99.9 })
        const semCrc = p.slice(0, -4)
        expect(semCrc.endsWith('6304')).toBe(true)
        expect(p.slice(-4)).toBe(crc16(semCrc))
    })

    it('omite o campo de valor (54) quando valor é 0 ou ausente', () => {
        const p = gerarPixCopiaECola()
        // Sem valor, não há a sequência "5303986" seguida de "5405..."
        expect(p).toContain('5303986')
        expect(p).not.toMatch(/53039865405/)
    })

    it('remove acentos do nome do recebedor', () => {
        const p = gerarPixCopiaECola({ valor: 5, nome: 'Café da Bugrá' })
        expect(p).toContain('CAFE DA BUGRA')
    })

    it('usa "***" como txid quando nenhum é informado', () => {
        const p = gerarPixCopiaECola({ valor: 5 })
        expect(p).toContain('0503***')
    })
})
