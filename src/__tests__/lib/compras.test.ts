/**
 * Testes do relatório de notas de compra.
 *
 * Os cenários vêm dos dados REAIS do banco (2026-07-24): fornecedor com grafia
 * divergente ("DRD DRISTRIBUIDORA" vs "DRD DISTRIBUIDORA"), fornecedor em
 * branco, itens lançados sem preço e entradas sem número de NF.
 */

import { describe, it, expect } from 'vitest'
import {
    resumirCompras,
    montarLinhasCompras,
    formatDataBR,
    normalizarFornecedor,
    type CompraRaw,
} from '@/lib/compras'

const raw: CompraRaw[] = [
    // numeric/int chegam como STRING do Supabase — de propósito aqui.
    { data_compra: '2026-06-05', numero_nota_fiscal: '134573', fornecedor: 'ROTELE', qtd_itens: '9', itens_sem_valor: '0', fornecedores_distintos: '1', valor_total: '403.27' },
    { data_compra: '2026-06-08', numero_nota_fiscal: '1484945', fornecedor: 'Ikeda', qtd_itens: 6, itens_sem_valor: 6, fornecedores_distintos: 1, valor_total: 0 },
    { data_compra: '2026-06-20', numero_nota_fiscal: '000645641', fornecedor: 'DRD DISTRIBUIDORA LTDA', qtd_itens: 5, itens_sem_valor: 0, fornecedores_distintos: 2, valor_total: 342.2 },
    // mesma empresa, grafia diferente entre notas ("ltda." vs "ltda")
    { data_compra: '2026-07-30', numero_nota_fiscal: '766021', fornecedor: 'souza cruz ltda.', qtd_itens: 6, itens_sem_valor: 4, fornecedores_distintos: 1, valor_total: 397.09 },
    { data_compra: '2026-07-31', numero_nota_fiscal: '766022', fornecedor: 'Souza Cruz LTDA', qtd_itens: 2, itens_sem_valor: 0, fornecedores_distintos: 1, valor_total: 100 },
    // entradas sem NF (não são notas — viram alerta)
    { data_compra: '2026-06-11', numero_nota_fiscal: null, fornecedor: 'avulso', qtd_itens: 54, itens_sem_valor: 10, fornecedores_distintos: 1, valor_total: 1271.92 },
]

describe('formatDataBR', () => {
    it('converte YYYY-MM-DD sem "voltar um dia" (sem passar por Date)', () => {
        expect(formatDataBR('2026-06-05')).toBe('05/06/2026')
        expect(formatDataBR('2026-01-01')).toBe('01/01/2026')
    })
    it('aceita timestamp e corta na data', () => {
        expect(formatDataBR('2026-06-05T00:00:00-04:00')).toBe('05/06/2026')
    })
    it('vazio/nulo vira travessão', () => {
        expect(formatDataBR(null)).toBe('—')
        expect(formatDataBR('')).toBe('—')
    })
})

describe('normalizarFornecedor', () => {
    it('ignora caixa, espaços repetidos e ponto final', () => {
        expect(normalizarFornecedor('souza cruz ltda.')).toBe('souza cruz ltda')
        expect(normalizarFornecedor('  Souza   Cruz  LTDA ')).toBe('souza cruz ltda')
    })
})

describe('montarLinhasCompras', () => {
    it('descarta linhas sem NF e converte os números que vêm como string', () => {
        const linhas = montarLinhasCompras(raw)
        expect(linhas).toHaveLength(5)
        expect(linhas[0].qtdItens).toBe(9)
        expect(linhas[0].valor).toBeCloseTo(403.27, 2)
        expect(linhas[0].data).toBe('05/06/2026')
    })

    it('fornecedor vazio vira "Não informado"', () => {
        const linhas = montarLinhasCompras([{ ...raw[0], fornecedor: '   ' }])
        expect(linhas[0].fornecedor).toBe('Não informado')
    })
})

describe('resumirCompras', () => {
    const r = resumirCompras(raw)

    it('conta as notas e soma só o que tem NF', () => {
        expect(r.qtdNotas).toBe(5)
        expect(r.total).toBeCloseTo(403.27 + 0 + 342.2 + 397.09 + 100, 2)
    })

    it('separa as entradas sem NF (não entram no total das notas)', () => {
        expect(r.semNf).toEqual({ itens: 54, valor: 1271.92 })
        // o valor sem NF não pode ter entrado no total das notas
        expect(r.total).toBeCloseTo(1242.56, 2)
    })

    it('soma os itens lançados sem preço (total subestimado)', () => {
        expect(r.itensSemValor).toBe(10) // 6 (Ikeda) + 4 (souza cruz)
    })

    it('sinaliza notas com grafia de fornecedor divergente', () => {
        expect(r.notasComDivergencia).toBe(1) // a DRD
    })

    it('agrupa o mesmo fornecedor escrito de formas diferentes', () => {
        const souza = r.porFornecedor.find((f) => /souza/i.test(f.fornecedor))
        expect(souza).toBeDefined()
        expect(souza!.notas).toBe(2)                       // 766021 + 766022
        expect(souza!.valor).toBeCloseTo(497.09, 2)
        expect(r.qtdFornecedores).toBe(4)                  // ROTELE, Ikeda, DRD, Souza Cruz
    })

    it('ordena o resumo por valor decrescente', () => {
        const valores = r.porFornecedor.map((f) => f.valor)
        expect([...valores].sort((a, b) => b - a)).toEqual(valores)
        expect(r.porFornecedor[0].valor).toBeGreaterThanOrEqual(r.porFornecedor[1].valor)
    })

    it('lista vazia não quebra', () => {
        const vazio = resumirCompras([])
        expect(vazio.qtdNotas).toBe(0)
        expect(vazio.total).toBe(0)
        expect(vazio.porFornecedor).toEqual([])
        expect(vazio.semNf).toEqual({ itens: 0, valor: 0 })
    })
})
