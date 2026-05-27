// =============================================
// CPF
// =============================================

/** Aplica máscara: 000.000.000-00 */
export function formatCPF(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** Remove máscara do CPF */
export function unformatCPF(value: string): string {
    return value.replace(/\D/g, '')
}

/** Valida CPF (algoritmo oficial) */
export function isValidCPF(cpf: string): boolean {
    const digits = unformatCPF(cpf)
    if (digits.length !== 11) return false
    if (/^(\d)\1+$/.test(digits)) return false

    const calc = (len: number) => {
        let sum = 0
        for (let i = 0; i < len; i++) {
            sum += parseInt(digits[i]) * (len + 1 - i)
        }
        const rest = (sum * 10) % 11
        return rest === 10 || rest === 11 ? 0 : rest
    }

    return calc(9) === parseInt(digits[9]) && calc(10) === parseInt(digits[10])
}

// =============================================
// WhatsApp / Telefone
// =============================================

/** Aplica máscara: (00) 00000-0000 */
export function formatWhatsApp(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 10) {
        return digits
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2')
    }
    return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
}

/** Remove máscara do WhatsApp */
export function unformatWhatsApp(value: string): string {
    return value.replace(/\D/g, '')
}

// =============================================
// Moeda
// =============================================

/** Formata número para moeda BRL */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value)
}

/** Converte string de moeda para número */
export function parseCurrency(value: string): number {
    return parseFloat(value.replace(/[^\d,]/g, '').replace(',', '.')) || 0
}

// =============================================
// Código de Barras EAN-13
// =============================================

/**
 * Valida checksum de EAN-13 (13 dígitos numéricos).
 * Algoritmo: soma dos dígitos em posição ímpar (1,3,5,...,11) +
 * 3 × soma dos dígitos em posição par (2,4,...,12); o dígito verificador
 * (posição 13) deve fazer o total chegar a um múltiplo de 10.
 */
export function isValidEAN13(value: string): boolean {
    if (!/^\d{13}$/.test(value)) return false
    let soma = 0
    for (let i = 0; i < 12; i++) {
        const d = parseInt(value[i], 10)
        soma += i % 2 === 0 ? d : d * 3
    }
    const dv = (10 - (soma % 10)) % 10
    return dv === parseInt(value[12], 10)
}
