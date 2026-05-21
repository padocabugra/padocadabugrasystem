// Tipagem minima da @point-of-sale/receipt-printer-encoder v3 — a lib nao
// publica types oficiais ate o momento. Cobrimos so o subset que usamos.

declare module '@point-of-sale/receipt-printer-encoder' {
    interface ReceiptPrinterEncoderOptions {
        language?: 'esc-pos' | 'star-prnt' | 'star-line'
        columns?: number
        feedBeforeCut?: number
        newline?: string
    }

    interface QrCodeOptions {
        model?: 1 | 2
        size?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
        errorlevel?: 'l' | 'm' | 'q' | 'h'
    }

    class ReceiptPrinterEncoder {
        constructor(options?: ReceiptPrinterEncoderOptions)
        initialize(): this
        align(value: 'left' | 'center' | 'right'): this
        bold(value: boolean): this
        size(value: 'small' | 'normal'): this
        line(value: string): this
        text(value: string): this
        newline(value?: number): this
        cut(value: 'partial' | 'full'): this
        qrcode(value: string, options?: QrCodeOptions): this
        encode(): Uint8Array
    }

    export default ReceiptPrinterEncoder
}
