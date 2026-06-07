/**
 * Integration-level math for the discount feature.
 *
 * Models the two real distributions that happen at payment time and asserts the
 * money invariants end to end — without DB/network:
 *  1) Caixa: the account discount is split across the account's orders
 *     (finalizar_venda_pdv gets each order's share); each order's net = total − share.
 *  2) NFC-e: the same discount is split across ALL items (brasilnfe sets
 *     ValorDesconto per item); VlPago = Σitens − Σdesconto.
 *
 * Both splits must sum back to the exact discount, so the net charged to the
 * cash drawer equals the fiscal total of the coupon.
 */

import { describe, it, expect } from 'vitest'
import {
    round2,
    calcularValorDesconto,
    distribuirDesconto,
} from '@/lib/desconto'

// Mirror brasilnfe.ts: VlPago = Σ(qty*unit) − Σ(item discounts).
function simularNFCe(itens: { qtd: number; unit: number }[], desconto: number) {
    const valorTotais = itens.map((i) => round2(i.qtd * i.unit))
    const bruto = round2(valorTotais.reduce((s, v) => s + v, 0))
    const descClamp = Math.min(Math.max(desconto, 0), bruto)
    const descItem = distribuirDesconto(descClamp, valorTotais)
    const vlPago = round2(bruto - descItem.reduce((s, v) => s + v, 0))
    return { bruto, descItem, vlPago }
}

// Mirror CaixaClient.handleFinalizarVenda: split the account discount across orders.
function simularConta(pedidosTotais: number[], desconto: number) {
    const bruto = round2(pedidosTotais.reduce((s, v) => s + v, 0))
    const descClamp = Math.min(round2(desconto), bruto)
    const porPedido = distribuirDesconto(descClamp, pedidosTotais)
    const netPorPedido = pedidosTotais.map((t, i) => round2(t - porPedido[i]))
    const net = round2(netPorPedido.reduce((s, v) => s + v, 0))
    return { bruto, porPedido, netPorPedido, net }
}

describe('fluxo NFC-e — desconto por item', () => {
    it('soma dos descontos por item = desconto, e VlPago = bruto - desconto', () => {
        const itens = [{ qtd: 1, unit: 20 }, { qtd: 1, unit: 30 }, { qtd: 1, unit: 50 }]
        const { bruto, descItem, vlPago } = simularNFCe(itens, 10)
        expect(bruto).toBe(100)
        expect(round2(descItem.reduce((s, v) => s + v, 0))).toBe(10)
        expect(vlPago).toBe(90)
    })

    it('item por peso (kg) com unitário quebrado mantém consistência', () => {
        // 0.350 kg @ 39,90 + 2 un @ 7,50
        const itens = [{ qtd: 0.35, unit: 39.9 }, { qtd: 2, unit: 7.5 }]
        const desconto = calcularValorDesconto('percentual', 10, round2(0.35 * 39.9 + 2 * 7.5))
        const { bruto, descItem, vlPago } = simularNFCe(itens, desconto)
        expect(round2(descItem.reduce((s, v) => s + v, 0))).toBe(desconto)
        expect(vlPago).toBe(round2(bruto - desconto))
        descItem.forEach((d, i) => expect(d).toBeLessThanOrEqual(round2(itens[i].qtd * itens[i].unit)))
    })
})

describe('fluxo Caixa — desconto rateado entre pedidos da conta', () => {
    it('1 pedido leva o desconto inteiro', () => {
        const { porPedido, net } = simularConta([80], 12.5)
        expect(porPedido).toEqual([12.5])
        expect(net).toBe(67.5)
    })

    it('vários pedidos: soma das parcelas = desconto e soma dos líquidos = bruto - desconto', () => {
        const { bruto, porPedido, net } = simularConta([30, 70], 10)
        expect(round2(porPedido.reduce((s, v) => s + v, 0))).toBe(10)
        expect(net).toBe(round2(bruto - 10))
    })

    it('conta NFC-e e conta caixa fecham no MESMO líquido', () => {
        // Conta: pedido A (itens 20+30) e pedido B (item 50) → bruto 100, desconto 10%
        const pedidoA = [{ qtd: 1, unit: 20 }, { qtd: 1, unit: 30 }]
        const pedidoB = [{ qtd: 1, unit: 50 }]
        const totalA = round2(pedidoA.reduce((s, i) => s + i.qtd * i.unit, 0))
        const totalB = round2(pedidoB.reduce((s, i) => s + i.qtd * i.unit, 0))
        const desconto = calcularValorDesconto('percentual', 10, round2(totalA + totalB))

        const conta = simularConta([totalA, totalB], desconto)
        const nfce = simularNFCe([...pedidoA, ...pedidoB], desconto)

        expect(conta.net).toBe(nfce.vlPago) // caixa == cupom fiscal
        expect(conta.net).toBe(90)
    })
})

describe('robustez — muitos casos aleatórios fecham exatamente', () => {
    it('soma das parcelas sempre bate com o desconto (centavos), em 500 cenários', () => {
        let rng = 123456789
        const rand = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff }

        for (let c = 0; c < 500; c++) {
            const n = 1 + Math.floor(rand() * 6)
            const totais = Array.from({ length: n }, () => round2(1 + rand() * 200))
            const bruto = round2(totais.reduce((s, v) => s + v, 0))
            const pct = round2(rand() * 90) // 0–90%
            const desconto = calcularValorDesconto('percentual', pct, bruto)

            const porPedido = distribuirDesconto(desconto, totais)
            const somaParcelas = round2(porPedido.reduce((s, v) => s + v, 0))
            const net = round2(totais.map((t, i) => round2(t - porPedido[i])).reduce((s, v) => s + v, 0))

            expect(somaParcelas).toBe(desconto)
            expect(net).toBe(round2(bruto - desconto))
            porPedido.forEach((d, i) => expect(d).toBeLessThanOrEqual(totais[i] + 0.0001))
        }
    })
})
