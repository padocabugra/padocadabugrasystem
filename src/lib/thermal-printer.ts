// =============================================================
// Impressora termica via WebUSB — impressao silenciosa de NFC-e
//
// Arquitetura profissional pra POS web 2026:
// - Funcionario clica UMA VEZ em "Conectar Impressora" no primeiro uso
// - Popup nativo do Chrome lista USBs; ele escolhe a termica
// - Browser persiste a permissao indefinidamente para o origin (Vercel)
// - Daqui em diante: navigator.usb.getDevices() devolve o device pareado
// - Cada NFC-e emitida dispara impressao automatica em background
//
// Requer: HTTPS (Vercel cobre), Chrome/Edge (90%+ dos PDVs).
// Compativel com: ESC/POS padrao (MDK-080 da Tomate, Epson TM-T20, Bematech
// MP-4200, Daruma DR-800, Elgin i9, Tanca TP-650 etc.)
// =============================================================

import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'

// USB Class 7 = impressoras (padrao USB-IF).
// Filtrar por classe pega TODAS as termicas plug-and-play sem precisar
// adivinhar vendorId/productId fabricante por fabricante.
const PRINTER_USB_CLASS_FILTER: USBDeviceFilter[] = [{ classCode: 7 }]

export interface DadosImpressaoNFCe {
    razaoSocial: string
    cnpj: string
    inscricaoEstadual?: string
    endereco?: string
    chaveAcesso: string
    itens: Array<{
        quantidade: number
        precoUnitario: number
        subtotal: number
        nome: string
        codigo?: string | null
    }>
    total: number
    valorPago: number
    troco: number
    formaPagamentoLabel: string
    dataHora: string
    cpfCliente?: string
}

// True quando o navegador tem WebUSB disponivel (HTTPS + Chrome/Edge).
export function webUsbDisponivel(): boolean {
    return typeof navigator !== 'undefined' && 'usb' in navigator
}

// Devolve o primeiro device ja autorizado pelo usuario, ou null.
// E sincrono apos a 1a vez — usado pra silent print em background.
export async function obterImpressoraPareada(): Promise<USBDevice | null> {
    if (!webUsbDisponivel()) return null
    try {
        const devices = await navigator.usb.getDevices()
        return devices[0] ?? null
    } catch {
        return null
    }
}

// Pede ao usuario pra escolher a impressora. So pode ser chamado a partir
// de um gesto de usuario (click). Popup nativo do Chrome lista USBs.
export async function pedirImpressora(): Promise<USBDevice | null> {
    if (!webUsbDisponivel()) {
        throw new Error('WebUSB nao disponivel — abra o sistema no Chrome ou Edge.')
    }
    try {
        const device = await navigator.usb.requestDevice({ filters: PRINTER_USB_CLASS_FILTER })
        return device
    } catch (err: any) {
        if (err?.name === 'NotFoundError') {
            // usuario clicou em Cancelar — nao e erro
            return null
        }
        throw err
    }
}

// Abre o device e pega a interface/endpoint de OUT (transferOut).
// Cada termica USB tem essa estrutura: configuration -> interface -> endpoint(s).
// A maioria tem 1 endpoint OUT direct-print.
async function prepararEndpointEscrita(device: USBDevice) {
    if (!device.opened) await device.open()
    if (device.configuration === null) await device.selectConfiguration(1)

    // Procura interface com endpoint OUT (impressora)
    for (const iface of device.configuration!.interfaces) {
        for (const alt of iface.alternates) {
            for (const ep of alt.endpoints) {
                if (ep.direction === 'out') {
                    // Claim a interface (pode falhar se OS estiver usando)
                    try {
                        await device.claimInterface(iface.interfaceNumber)
                    } catch {
                        // ja estava reivindicada — segue
                    }
                    return { interfaceNumber: iface.interfaceNumber, endpointNumber: ep.endpointNumber }
                }
            }
        }
    }
    throw new Error('Impressora nao tem endpoint OUT — modelo nao suportado via WebUSB.')
}

// Constroi os bytes ESC/POS pro DANFE NFC-e em 80mm.
// Layout segue padrao SEFAZ: cabecalho centralizado, itens, totais, chave, QR-Code.
function montarCupomEscPos(dados: DadosImpressaoNFCe): Uint8Array {
    const enc = new ReceiptPrinterEncoder({
        language: 'esc-pos',
        columns: 48,            // 80mm em fonte padrao
        feedBeforeCut: 3,
        newline: '\n',
    })

    // URL de consulta SEFAZ-MS pro QR-Code
    const ambiente = dados.chaveAcesso.charAt(20) === '1' ? '1' : '2'
    const baseUrl = ambiente === '1'
        ? 'https://www.dfe.ms.gov.br/nfce/qrcode'
        : 'https://www.dfe.ms.gov.br/nfcehom/qrcode'
    const urlQrCode = `${baseUrl}?p=${dados.chaveAcesso}|2|${ambiente}|1`

    const chaveFormatada = dados.chaveAcesso
        .replace(/\D/g, '')
        .replace(/(\d{4})(?=\d)/g, '$1 ')

    enc
        .initialize()
        .align('center')
        .bold(true)
        .line(dados.razaoSocial)
        .bold(false)
        .size('small')
        .line(`CNPJ: ${dados.cnpj}`)

    if (dados.inscricaoEstadual) enc.line(`IE: ${dados.inscricaoEstadual}`)
    if (dados.endereco) enc.line(dados.endereco)

    enc
        .size('normal')
        .line('--------------------------------')
        .bold(true)
        .line('DANFE NFC-e')
        .bold(false)
        .size('small')
        .line('Documento Auxiliar da NFC-e')
        .size('normal')
        .line('--------------------------------')
        .align('left')

    // Tabela de itens
    dados.itens.forEach((item, i) => {
        const num = String(i + 1).padStart(3, '0')
        const codigo = item.codigo ? `[${item.codigo}] ` : ''
        enc.line(`${num} ${codigo}${item.nome}`.slice(0, 48))
        const linhaQtd = `${item.quantidade} x ${formatBRL(item.precoUnitario)}`
        const linhaTotal = formatBRL(item.subtotal)
        const espacos = Math.max(1, 48 - linhaQtd.length - linhaTotal.length)
        enc.line(linhaQtd + ' '.repeat(espacos) + linhaTotal)
    })

    enc.line('--------------------------------')

    // Totais
    const linhaTotal = `TOTAL R$`
    const valorTotal = formatBRL(dados.total)
    enc
        .bold(true)
        .line(linhaTotal + ' '.repeat(48 - linhaTotal.length - valorTotal.length) + valorTotal)
        .bold(false)

    const pagto = `${dados.formaPagamentoLabel}`
    const valorPg = formatBRL(dados.valorPago)
    enc.line(pagto + ' '.repeat(48 - pagto.length - valorPg.length) + valorPg)

    if (dados.troco > 0) {
        const t = 'Troco'
        const v = formatBRL(dados.troco)
        enc.line(t + ' '.repeat(48 - t.length - v.length) + v)
    }

    enc.line('--------------------------------').align('center')

    if (dados.cpfCliente) {
        enc.size('small').line(`CPF/CNPJ Consumidor: ${dados.cpfCliente}`).size('normal')
    }

    enc
        .size('small')
        .line('Consulte pela Chave de Acesso em:')
        .line('www.dfe.ms.gov.br/nfce')
        .newline()
        .line('CHAVE DE ACESSO')
        .line(chaveFormatada)
        .newline()
        .qrcode(urlQrCode, { model: 2, size: 6, errorlevel: 'm' })
        .newline()
        .line(`Emitido em ${dados.dataHora}`)
        .newline()
        .newline()
        .cut('partial')

    return enc.encode()
}

// Helper formatador BRL sem cifrao (cabe melhor em colunas estreitas).
function formatBRL(v: number): string {
    return v.toFixed(2).replace('.', ',')
}

// Imprime o DANFE NFC-e enviando bytes ESC/POS via WebUSB.
// Throw se falhar (rede USB, papel travado, device desconectado).
export async function imprimirNFCe(device: USBDevice, dados: DadosImpressaoNFCe): Promise<void> {
    const { endpointNumber } = await prepararEndpointEscrita(device)
    const bytes = montarCupomEscPos(dados)
    // Copia pra ArrayBuffer "puro" (nao SharedArrayBuffer) — WebUSB exige
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)
    const result = await device.transferOut(endpointNumber, buffer)
    if (result.status !== 'ok') {
        throw new Error(`Falha ao enviar dados pra impressora (status: ${result.status})`)
    }
}
