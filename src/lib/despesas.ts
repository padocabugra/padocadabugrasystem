/**
 * Despesas / custos fixos da empresa.
 *
 * Regras de negócio puras (sem React, sem Supabase) para a tela de Despesas:
 * catálogo de categorias, resumo do mês e a cópia do mês anterior.
 *
 * ⚠️ Datas: competência é sempre a string 'YYYY-MM-01'. A navegação entre meses
 * é feita por ARITMÉTICA DE CALENDÁRIO — nunca por `new Date('YYYY-MM-DD')`,
 * que é lido como UTC e "volta um dia" no nosso fuso.
 */

import { MESES_PT } from './periodo'

export const CATEGORIAS_DESPESA = [
    { value: 'funcionarios', label: 'Funcionários' },
    { value: 'aluguel', label: 'Aluguel' },
    { value: 'energia', label: 'Energia' },
    { value: 'agua', label: 'Água' },
    { value: 'gas', label: 'Gás' },
    { value: 'impostos', label: 'Impostos' },
    { value: 'outros', label: 'Outros' },
] as const

export type CategoriaDespesa = (typeof CATEGORIAS_DESPESA)[number]['value']

export function labelCategoria(v: string): string {
    return CATEGORIAS_DESPESA.find((c) => c.value === v)?.label ?? v
}

export interface Despesa {
    id: string
    competencia: string          // 'YYYY-MM-DD' (dia 1)
    categoria: CategoriaDespesa
    descricao: string
    valor: number | string       // numeric do Supabase chega como string
    pago: boolean
    vencimento: string | null
    observacao: string | null
}

export interface ResumoCategoria {
    categoria: CategoriaDespesa
    label: string
    valor: number
    qtd: number
}

export interface ResumoDespesas {
    total: number
    totalPago: number
    totalAberto: number
    qtd: number
    porCategoria: ResumoCategoria[]
}

/** Totais do mês + quebra por categoria (na ordem do catálogo, sem as vazias). */
export function resumirDespesas(despesas: Despesa[]): ResumoDespesas {
    const num = (v: number | string) => Number(v) || 0
    const total = despesas.reduce((s, d) => s + num(d.valor), 0)
    const totalPago = despesas.filter((d) => d.pago).reduce((s, d) => s + num(d.valor), 0)

    const porCategoria = CATEGORIAS_DESPESA.map(({ value, label }) => {
        const doGrupo = despesas.filter((d) => d.categoria === value)
        return {
            categoria: value as CategoriaDespesa,
            label,
            valor: doGrupo.reduce((s, d) => s + num(d.valor), 0),
            qtd: doGrupo.length,
        }
    }).filter((c) => c.qtd > 0)

    return {
        total,
        totalPago,
        totalAberto: total - totalPago,
        qtd: despesas.length,
        porCategoria,
    }
}

// ─── Competência (mês de referência) ─────────────────────────────────────────

/** Competência do mês atual, no fuso da empresa: 'YYYY-MM-01'. */
export function competenciaAtual(hojeYMD?: string): string {
    return (hojeYMD ? `${hojeYMD.slice(0, 7)}-01` : `${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Campo_Grande' }).slice(0, 7)}-01`)
}

/** Anda `delta` meses a partir de uma competência. -1 = mês anterior. */
export function navegarCompetencia(competencia: string, delta: number): string {
    const [ano, mes] = competencia.slice(0, 7).split('-').map(Number)
    const total = ano * 12 + (mes - 1) + delta
    const novoAno = Math.floor(total / 12)
    const novoMes = (total % 12) + 1
    return `${novoAno}-${String(novoMes).padStart(2, '0')}-01`
}

/** '2026-08-01' → 'Agosto/2026' */
export function competenciaLabel(competencia: string): string {
    const [ano, mes] = competencia.slice(0, 7).split('-').map(Number)
    const nome = MESES_PT[mes - 1] ?? ''
    return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${ano}`
}

// ─── Cópia do mês anterior ───────────────────────────────────────────────────

const chaveDespesa = (d: Pick<Despesa, 'categoria' | 'descricao'>) =>
    `${d.categoria}|${d.descricao.trim().replace(/\s+/g, ' ').toLowerCase()}`

/**
 * Quais despesas do mês anterior ainda NÃO existem no mês atual.
 *
 * É o que faz o botão "Repetir mês anterior" ser seguro: clicar duas vezes não
 * duplica nada, porque o que já está lançado (mesma categoria + descrição) é
 * ignorado. Os valores vêm como estavam — ela ajusta só o que mudou — e nada
 * é copiado como pago.
 */
export function despesasParaCopiar(
    doMesAnterior: Despesa[],
    doMesAtual: Despesa[],
): { categoria: CategoriaDespesa; descricao: string; valor: number; observacao: string | null }[] {
    const existentes = new Set(doMesAtual.map(chaveDespesa))
    return doMesAnterior
        .filter((d) => !existentes.has(chaveDespesa(d)))
        .map((d) => ({
            categoria: d.categoria,
            descricao: d.descricao,
            valor: Number(d.valor) || 0,
            observacao: d.observacao,
        }))
}
