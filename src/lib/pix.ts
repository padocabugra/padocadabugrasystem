// =============================================================
// PIX — Geração de BR Code ("Pix Copia e Cola") estático com valor
//
// Implementa o payload EMV®QRCPS do Banco Central (Manual do BR Code /
// arranjo Pix). O QR é gerado no client a partir desta string e também
// pode ser copiado como "Pix Copia e Cola".
//
// Recebedor fixo: CNPJ da Cozinha/Café da Bugra (chave Pix = CNPJ).
// O QR aparece na tela do Caixa/PDV ao escolher pagamento via PIX.
//
// O CRC16 (campo 63) é obrigatório e validado pelos apps bancários —
// por isso o payload precisa ser montado por código (a versão anterior,
// hard-coded, tinha tamanhos e CRC inválidos e não era pago de fato).
// =============================================================

/** Dados do recebedor (estabelecimento). Chave Pix = CNPJ, só dígitos. */
export const PIX_RECEBEDOR = {
    /** Chave Pix = CNPJ 57.516.294/0002-92 → somente dígitos. */
    chave: '57516294000292',
    /** Nome do recebedor (campo 59, máx. 25 chars, ASCII). */
    nome: 'PADOCA DA BUGRA',
    /** Cidade do recebedor (campo 60, máx. 15 chars, ASCII). */
    cidade: 'CAMPO GRANDE',
} as const

// ─── Helpers internos ────────────────────────────────────────────────────────

/** Monta um campo TLV: id (2) + tamanho (2, zero-padded) + valor. */
function tlv(id: string, valor: string): string {
    const tamanho = valor.length.toString().padStart(2, '0')
    return `${id}${tamanho}${valor}`
}

/** Remove acentos/caracteres não-ASCII e força maiúsculas (campos 59/60). */
function sanitizarTexto(input: string, maxLen: number): string {
    return (input ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // remove acentos (diacríticos combinantes)
        .replace(/[^\x20-\x7E]/g, '')    // só ASCII imprimível
        .toUpperCase()
        .trim()
        .slice(0, maxLen)
}

/** txid alfanumérico (campo 62/05). '***' = sem identificador. Máx. 25. */
function sanitizarTxid(input?: string): string {
    if (!input) return '***'
    const limpo = input.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25)
    return limpo || '***'
}

/**
 * CRC16/CCITT-FALSE — polinômio 0x1021, valor inicial 0xFFFF.
 * Calculado sobre todo o payload incluindo "6304". Retorna 4 hex maiúsculos.
 */
export function crc16(payload: string): string {
    let crc = 0xffff
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8
        for (let j = 0; j < 8; j++) {
            crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1
            crc &= 0xffff
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0')
}

export interface GerarPixParams {
    /** Chave Pix do recebedor (default: CNPJ da Bugra). */
    chave?: string
    /** Nome do recebedor (default: PADOCA DA BUGRA). */
    nome?: string
    /** Cidade do recebedor (default: CAMPO GRANDE). */
    cidade?: string
    /** Valor da cobrança em reais. Omitido/≤0 = QR sem valor (cliente digita). */
    valor?: number
    /** Identificador da transação (alfanumérico). Default '***' (sem id). */
    txid?: string
}

/**
 * Gera a string "Pix Copia e Cola" (BR Code estático) pronta para virar QR.
 *
 * @example
 *   gerarPixCopiaECola({ valor: 12.5 })
 *   // → "00020126...6304XXXX"
 */
export function gerarPixCopiaECola(params: GerarPixParams = {}): string {
    const chave = (params.chave ?? PIX_RECEBEDOR.chave).trim()
    const nome = sanitizarTexto(params.nome ?? PIX_RECEBEDOR.nome, 25) || 'RECEBEDOR'
    const cidade = sanitizarTexto(params.cidade ?? PIX_RECEBEDOR.cidade, 15) || 'BRASIL'
    const txid = sanitizarTxid(params.txid)

    // Campo 26 — Merchant Account Information (GUI + chave Pix)
    const merchantAccount =
        tlv('00', 'br.gov.bcb.pix') +
        tlv('01', chave)

    // Campo 62 — Additional Data Field (txid)
    const additionalData = tlv('05', txid)

    // Valor: 2 casas, ponto decimal, sem separador de milhar. Só inclui se > 0.
    const temValor = typeof params.valor === 'number' && params.valor > 0
    const valorStr = temValor ? params.valor!.toFixed(2) : ''

    const payloadSemCRC =
        tlv('00', '01') +                         // Payload Format Indicator
        tlv('26', merchantAccount) +              // Merchant Account Information — Pix
        tlv('52', '0000') +                       // Merchant Category Code
        tlv('53', '986') +                        // Moeda (BRL)
        (temValor ? tlv('54', valorStr) : '') +   // Valor (opcional)
        tlv('58', 'BR') +                         // País
        tlv('59', nome) +                         // Nome do recebedor
        tlv('60', cidade) +                       // Cidade do recebedor
        tlv('62', additionalData) +               // Dados adicionais (txid)
        '6304'                                     // CRC16 (id + tamanho fixo)

    return payloadSemCRC + crc16(payloadSemCRC)
}
