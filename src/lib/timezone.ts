import { formatInTimeZone } from 'date-fns-tz'

export const TIMEZONE = 'America/Campo_Grande'

/**
 * Retorna o início do dia atual (ou de uma data fornecida) 
 * no formato ISO completo (ex: 2026-03-16T00:00:00.000-04:00) 
 * compatível perfeitamente com timestamptz do Supabase!
 */
export function getInicioDoDia(dataFornecida: Date | number | string = new Date()): string {
    return formatInTimeZone(new Date(dataFornecida), TIMEZONE, "yyyy-MM-dd'T'00:00:00.000XXX")
}

/**
 * Retorna o final do dia atual ou de uma data fornecida.
 */
export function getFimDoDia(dataFornecida: Date | number | string = new Date()): string {
    return formatInTimeZone(new Date(dataFornecida), TIMEZONE, "yyyy-MM-dd'T'23:59:59.999XXX")
}

/**
 * Formata qualquer timestamp/Date para ser exibido visualmente no horário de MS.
 * Padrão (dd/MM/yyyy HH:mm:ss)
 */
export function dataHoraLocalVisual(data: Date | string | number | null | undefined, formato = 'dd/MM/yyyy HH:mm:ss'): string {
    if (!data) return ''
    return formatInTimeZone(new Date(data), TIMEZONE, formato)
}

/**
 * Formata visualmente para exibir apenas `dd/MM/yyyy`.
 */
export function dataLocalVisual(data: Date | string | number | null | undefined): string {
    return dataHoraLocalVisual(data, 'dd/MM/yyyy')
}

/**
 * Usado se precisarmos da string no formato numérico YYYY-MM-DD
 * Baseado puramente no horário de Campo Grande.
 */
export function getStringDataYMD(dataFornecida: Date | string | number = new Date()): string {
    return formatInTimeZone(new Date(dataFornecida), TIMEZONE, 'yyyy-MM-dd')
}

/**
 * Agora mesmo sem formatação, em milissegundos UTC (para comparações ou registros).
 */
export function getAgoraUTC(): string {
    return new Date().toISOString()
}
