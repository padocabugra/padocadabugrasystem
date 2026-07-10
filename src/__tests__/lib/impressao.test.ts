/**
 * Tests for print-option logic (src/lib/impressao.ts).
 *
 * Garante que a escolha do operador ("O que imprimir?") traduz corretamente
 * nos dois papéis independentes — Nota de Pedido (não-fiscal) e cupom fiscal
 * (DANFE) — e que o padrão da casa respeita a flag NEXT_PUBLIC_IMPRIMIR_NFCE.
 *
 * NOTA: a NFC-e é SEMPRE emitida à SEFAZ; nada aqui controla a emissão fiscal,
 * apenas qual papel sai na impressora térmica.
 */

import { describe, it, expect } from 'vitest'
import {
    resolverImpressao,
    opcaoImpressaoPadrao,
    OPCOES_IMPRESSAO,
    IMPRIMIR_NFCE_PADRAO,
    type OpcaoImpressao,
} from '@/lib/impressao'

describe('resolverImpressao', () => {
    it('"ambos" imprime os dois papéis', () => {
        expect(resolverImpressao('ambos')).toEqual({ imprimirPedido: true, imprimirNota: true })
    })

    it('"pedido" imprime só a Nota de Pedido (sem cupom fiscal)', () => {
        expect(resolverImpressao('pedido')).toEqual({ imprimirPedido: true, imprimirNota: false })
    })

    it('"nota" imprime só o cupom fiscal (sem Nota de Pedido)', () => {
        expect(resolverImpressao('nota')).toEqual({ imprimirPedido: false, imprimirNota: true })
    })

    it('"nenhum" não imprime nenhum papel', () => {
        expect(resolverImpressao('nenhum')).toEqual({ imprimirPedido: false, imprimirNota: false })
    })

    it('imprimirPedido é verdadeiro exatamente para "ambos" e "pedido"', () => {
        const comPedido = (['ambos', 'pedido', 'nota', 'nenhum'] as OpcaoImpressao[])
            .filter((o) => resolverImpressao(o).imprimirPedido)
        expect(comPedido).toEqual(['ambos', 'pedido'])
    })

    it('imprimirNota é verdadeiro exatamente para "ambos" e "nota"', () => {
        const comNota = (['ambos', 'pedido', 'nota', 'nenhum'] as OpcaoImpressao[])
            .filter((o) => resolverImpressao(o).imprimirNota)
        expect(comNota).toEqual(['ambos', 'nota'])
    })
})

describe('opcaoImpressaoPadrao', () => {
    it('deriva o padrão da flag da casa (IMPRIMIR_NFCE_PADRAO)', () => {
        // A flag é lida do ambiente no import; o padrão é coerente com ela.
        expect(opcaoImpressaoPadrao()).toBe(IMPRIMIR_NFCE_PADRAO ? 'ambos' : 'pedido')
    })

    it('o padrão sempre inclui a Nota de Pedido (nunca deixa o cliente sem comprovante)', () => {
        expect(resolverImpressao(opcaoImpressaoPadrao()).imprimirPedido).toBe(true)
    })
})

describe('OPCOES_IMPRESSAO', () => {
    it('cobre exatamente as 4 opções, sem repetição', () => {
        const values = OPCOES_IMPRESSAO.map((o) => o.value)
        expect(values).toEqual(['ambos', 'pedido', 'nota', 'nenhum'])
        expect(new Set(values).size).toBe(4)
    })

    it('toda opção tem título e subtítulo preenchidos', () => {
        for (const opt of OPCOES_IMPRESSAO) {
            expect(opt.titulo.length).toBeGreaterThan(0)
            expect(opt.subtitulo.length).toBeGreaterThan(0)
        }
    })
})
