// =============================================================
// Desconto no pagamento — cálculos puros (R$ e %).
//
// Centraliza a matemática do desconto pra que o mesmo resultado valha no
// Caixa, na Venda Rápida e na NFC-e:
//  - calcularValorDesconto: converte a entrada do operador (R$ ou %) no
//    valor em reais do desconto, sempre saneado (>= 0, <= total, 2 casas).
//  - distribuirDesconto: rateia um desconto entre itens/pedidos de forma que
//    a SOMA das parcelas seja EXATAMENTE o desconto (sem perder centavos no
//    arredondamento) — essencial pra NFC-e e pra contas com vários pedidos.
// =============================================================

export type TipoDesconto = 'valor' | 'percentual'

/** Arredonda para 2 casas (centavos), neutralizando erro de ponto flutuante. */
export function round2(v: number): number {
    return Math.round((v + Number.EPSILON) * 100) / 100
}

/**
 * Converte a entrada do operador no valor (R$) do desconto.
 * - 'valor'      → o próprio valor digitado em reais.
 * - 'percentual' → `entrada`% (0–100) aplicado sobre o total bruto.
 *
 * Nunca retorna negativo nem maior que o total bruto; sempre 2 casas.
 */
export function calcularValorDesconto(
    tipo: TipoDesconto,
    entrada: number,
    totalBruto: number,
): number {
    if (!Number.isFinite(entrada) || entrada <= 0 || totalBruto <= 0) return 0
    const bruto = tipo === 'percentual'
        ? totalBruto * (entrada / 100)
        : entrada
    return Math.min(round2(bruto), round2(totalBruto))
}

/** Percentual que `desconto` representa sobre `totalBruto` (pra exibição). */
export function percentualDoDesconto(desconto: number, totalBruto: number): number {
    if (totalBruto <= 0) return 0
    return round2((desconto / totalBruto) * 100)
}

/**
 * Rateia `desconto` entre parcelas proporcionalmente aos `pesos` (subtotais),
 * garantindo que a soma das parcelas seja exatamente `desconto`. A sobra de
 * centavos do arredondamento é jogada na maior parcela (a que tem mais folga).
 * Cada parcela é limitada ao próprio peso (nunca desconta mais que o item vale).
 */
export function distribuirDesconto(desconto: number, pesos: number[]): number[] {
    const totalPeso = pesos.reduce((s, p) => s + p, 0)
    if (desconto <= 0 || totalPeso <= 0) return pesos.map(() => 0)

    const d = Math.min(round2(desconto), round2(totalPeso))
    const parcelas = pesos.map((p) => round2((d * p) / totalPeso))

    // Corrige a diferença de arredondamento na maior parcela.
    const soma = round2(parcelas.reduce((s, v) => s + v, 0))
    const resto = round2(d - soma)
    if (resto !== 0 && parcelas.length > 0) {
        let idx = 0
        for (let i = 1; i < pesos.length; i++) {
            if (pesos[i] > pesos[idx]) idx = i
        }
        parcelas[idx] = round2(parcelas[idx] + resto)
    }

    // Clamp defensivo: nunca abaixo de 0 nem acima do peso do item.
    return parcelas.map((v, i) => Math.max(0, Math.min(v, round2(pesos[i]))))
}
