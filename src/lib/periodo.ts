/**
 * Períodos de MÊS FECHADO (dia 1 → último dia) para os relatórios.
 *
 * A contabilidade trabalha sempre em mês cheio, então os atalhos "Este mês" /
 * "Mês passado" precisam cair exatamente em 01→30/31 — e não em "últimos 30
 * dias".
 *
 * ⚠️ Timezone: as strings YYYY-MM-DD são montadas por ARITMÉTICA DE CALENDÁRIO,
 * sem converter Date↔fuso. O único uso de fuso é descobrir que dia é hoje na
 * empresa (getStringDataYMD → America/Campo_Grande). Isso evita a pegadinha
 * clássica de "voltar um dia" quando a máquina está em outro fuso.
 */

import { getStringDataYMD } from './timezone'

export const MESES_PT = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export interface PeriodoMes {
    inicio: string   // YYYY-MM-DD (dia 1)
    fim: string      // YYYY-MM-DD (último dia do mês)
    rotulo: string   // "agosto-2026"
}

/**
 * Mês fechado. `offset` 0 = este mês, -1 = mês passado, -2 = retrasado…
 * `hojeYMD` é injetável para teste (default: hoje no fuso da empresa).
 */
export function mesFechado(offset: number, hojeYMD?: string): PeriodoMes {
    const [anoHoje, mesHoje] = (hojeYMD ?? getStringDataYMD(new Date())).split('-').map(Number)
    const ref = new Date(anoHoje, mesHoje - 1 + offset, 1)   // aritmética local pura
    const ano = ref.getFullYear()
    const mes = ref.getMonth() + 1
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const mm = String(mes).padStart(2, '0')
    return {
        inicio: `${ano}-${mm}-01`,
        fim: `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}`,
        rotulo: `${MESES_PT[mes - 1]}-${ano}`,
    }
}

/**
 * Nome amigável do período para o arquivo: quando o intervalo é exatamente um
 * mês fechado (dos últimos 13 meses) vira "agosto-2026"; senão, as datas cruas.
 */
export function rotuloPeriodoArquivo(inicio: string, fim: string, hojeYMD?: string): string {
    for (let off = 0; off >= -12; off--) {
        const m = mesFechado(off, hojeYMD)
        if (m.inicio === inicio && m.fim === fim) return m.rotulo
    }
    return `${inicio}_a_${fim}`
}
