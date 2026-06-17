// =============================================================
// Coerção numérica segura para valores vindos do banco.
//
// CONTEXTO / POR QUE ISTO EXISTE:
// O Supabase/PostgREST devolve colunas `numeric` como STRING no JSON (ex.: a
// coluna `caixa.saldo = 233.01` chega como "233.01"), pra não perder precisão.
// Os tipos TypeScript gerados, porém, declaram esses campos como `number` — ou
// seja, em runtime eles são strings, mas o compilador acha que são números.
//
// Isso é uma armadilha clássica: qualquer soma com `+` vira CONCATENAÇÃO.
//   "171.11" + 61.9  === "171.1161.9"   (string com DOIS pontos decimais)
// Esse valor, ao ser gravado de volta numa coluna numeric, é REJEITADO pelo
// Postgres ("invalid input syntax for type numeric"). Foi exatamente o bug do
// REFORÇO de caixa (saldo + valor), enquanto a SANGRIA "funcionava" só porque o
// operador `-` coage a string pra número antes de subtrair.
//
// `toNum` normaliza esses valores na fronteira de leitura: depois dele, a
// aritmética do componente opera sobre números de verdade. BLINDAGEM: use isto
// em TODO ponto onde um `numeric` do banco entra em conta.
// =============================================================

/**
 * Converte um valor desconhecido (number | string | null | undefined) num
 * `number` finito. Retorna `fallback` (default 0) para nulo, vazio ou não
 * numérico — NUNCA retorna NaN.
 *
 * Aceita o ponto decimal do banco ("171.11") e, defensivamente, a vírgula
 * decimal pt-BR ("171,11") caso algum valor de input passe por aqui.
 */
export function toNum(value: unknown, fallback = 0): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : fallback
    }
    if (typeof value === 'bigint') {
        return Number(value)
    }
    if (typeof value === 'string') {
        const s = value.trim()
        if (s === '') return fallback
        // Banco usa ponto; vírgula só apareceria em entrada de usuário.
        const n = parseFloat(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s)
        return Number.isFinite(n) ? n : fallback
    }
    return fallback
}
