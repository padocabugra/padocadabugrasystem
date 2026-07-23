/**
 * Utilidades da CHAVE DE ACESSO da NFC-e (44 dígitos) + montagem do relatório de
 * notas fiscais para a contabilidade.
 *
 * A chave de 44 dígitos codifica os campos da nota (layout oficial SEFAZ):
 *   cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 * posições:  0-2   2-6      6-20    20-22   22-25   25-34    34-35    35-43  43-44
 *
 * Assim conseguimos exibir Número e Série da nota sem guardar colunas extras —
 * eles saem direto da chave que já está gravada em pedidos.chave_nfce.
 */

export interface ChaveNFCeCampos {
    uf: string
    aamm: string
    cnpj: string
    modelo: string
    serie: string   // 3 dígitos, com zeros à esquerda
    numero: string  // 9 dígitos, com zeros à esquerda
}

/** Faz o parse da chave de 44 dígitos. Retorna null se a chave for inválida. */
export function parseChaveNFCe(chave: string | null | undefined): ChaveNFCeCampos | null {
    if (!chave) return null
    const c = chave.replace(/\D/g, '')
    if (c.length !== 44) return null
    return {
        uf: c.slice(0, 2),
        aamm: c.slice(2, 6),
        cnpj: c.slice(6, 20),
        modelo: c.slice(20, 22),
        serie: c.slice(22, 25),
        numero: c.slice(25, 34),
    }
}

/** Número da nota sem zeros à esquerda (ex.: "000000123" → "123"). "—" se inválido. */
export function numeroNotaFromChave(chave: string | null | undefined): string {
    const p = parseChaveNFCe(chave)
    if (!p) return '—'
    const n = parseInt(p.numero, 10)
    return Number.isNaN(n) ? '—' : String(n)
}

/** Série da nota sem zeros à esquerda (ex.: "001" → "1"). "—" se inválido. */
export function serieNotaFromChave(chave: string | null | undefined): string {
    const p = parseChaveNFCe(chave)
    if (!p) return '—'
    const s = parseInt(p.serie, 10)
    return Number.isNaN(s) ? '—' : String(s)
}

// ─── Montagem do relatório ───────────────────────────────────────────────────

// Rótulos amigáveis por status (só 'emitida' entra no relatório contábil, mas
// mantemos o mapa por robustez).
const SITUACAO_LABEL: Record<string, string> = {
    emitida: 'Autorizada',
    pendente: 'Pendente',
    erro: 'Rejeitada',
    nao_aplicavel: 'N/A',
}

export interface NotaFiscalRaw {
    id: string
    created_at: string
    chave_nfce: string | null
    total: number | string | null
    nfce_status: string
}

export interface LinhaNotaFiscal {
    id: string
    data: string        // dd/mm/aaaa (horário de Campo Grande)
    hora: string        // HH:mm
    numero: string
    serie: string
    chave: string       // 44 dígitos crus (ou "—" se ausente)
    valor: number
    situacao: string
}

const TZ = 'America/Campo_Grande'

function formatarData(iso: string): { data: string; hora: string } {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return { data: '—', hora: '' }
    return {
        data: d.toLocaleDateString('pt-BR', { timeZone: TZ }),
        hora: d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
    }
}

/**
 * Transforma as notas cruas (linhas de `pedidos`) nas linhas do relatório,
 * derivando número/série da chave e somando o total. Função PURA (à parte da
 * formatação de data, que depende do fuso) — usada pela tela e pelos exports.
 */
export function montarLinhasNotas(notas: NotaFiscalRaw[]): {
    linhas: LinhaNotaFiscal[]
    total: number
    quantidade: number
} {
    const linhas = notas.map((n) => {
        const { data, hora } = formatarData(n.created_at)
        return {
            id: n.id,
            data,
            hora,
            numero: numeroNotaFromChave(n.chave_nfce),
            serie: serieNotaFromChave(n.chave_nfce),
            chave: n.chave_nfce ? n.chave_nfce.replace(/\D/g, '') : '—',
            valor: Number(n.total) || 0,
            situacao: SITUACAO_LABEL[n.nfce_status] ?? n.nfce_status,
        }
    })
    const total = linhas.reduce((s, l) => s + l.valor, 0)
    return { linhas, total, quantidade: linhas.length }
}
