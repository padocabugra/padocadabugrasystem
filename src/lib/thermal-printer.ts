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

// Tipo unificado: a "impressora" pode ser USB direto OU porta serial virtual.
// No Windows, quando o driver da impressora reivindica o USB exclusivamente
// (causando "Access Denied" no WebUSB.open), a porta serial virtual e o
// caminho de saida — ela e exposta como COM port pelo proprio driver.
export type ImpressoraPareada =
    | { tipo: 'usb'; device: USBDevice }
    | { tipo: 'serial'; port: SerialPort }

export interface DadosImpressaoNFCe {
    razaoSocial: string
    cnpj: string
    inscricaoEstadual?: string
    endereco?: string
    chaveAcesso: string
    /** URL do QR-Code oficial da SEFAZ (infNFeSupl/qrCode, com hash CSC). Quando
     *  ausente, cai no fallback (URL de consulta por chave, sem hash). */
    qrCodeUrl?: string
    itens: Array<{
        quantidade: number
        precoUnitario: number
        subtotal: number
        nome: string
        codigo?: string | null
    }>
    total: number               // total LÍQUIDO (já com desconto aplicado)
    desconto?: number           // desconto concedido (R$); mostra Subtotal/Desconto quando > 0
    valorPago: number
    troco: number
    formaPagamentoLabel: string
    dataHora: string
    cpfCliente?: string
}

// Dados pro comprovante de FECHAMENTO DE CAIXA (relatorio financeiro do turno).
// Espelha o resumo calculado pela RPC resumo_caixa_dia + o valor contado/diferenca
// apurados no fechamento. Nao e documento fiscal — e relatorio interno de conferencia.
export interface DadosImpressaoFechamento {
    razaoSocial: string
    cnpj?: string
    operador: string
    dataHora: string
    aberturaValor: number
    totalVendas: number
    qtdVendas: number
    totalDinheiro: number
    totalPix: number
    totalDebito: number
    totalCredito: number
    totalSangrias: number
    totalReforcos: number
    saldoEsperadoDinheiro: number
    valorContado: number
    diferenca: number          // contado - esperado (>0 sobra, <0 falta, 0 confere)
    observacao?: string
}

// Dados pra NOTA DE PEDIDO (comanda de producao + comprovante do cliente).
// Nao e documento fiscal — impressa na termica no momento do pagamento, no
// lugar do DANFE (a NFC-e continua sendo emitida pela API, so nao imprime).
export interface DadosImpressaoPedido {
    razaoSocial: string
    cnpj: string
    tipoPedido?: string          // 'LOCAL' | 'DELIVERY'
    destino?: string             // 'COZINHA' | 'CAFETERIA' | 'CAIXA'
    numeroMesa?: number | null
    comandaNumero?: number | null
    clienteNome?: string | null
    itens: Array<{
        quantidade: number
        precoUnitario: number
        subtotal: number
        nome: string
        unidadeMedida?: string | null
    }>
    total: number
    formaPagamentoLabel?: string
    observacoes?: string | null
    dataHora: string
}

// True quando o navegador tem WebUSB disponivel (HTTPS + Chrome/Edge).
export function webUsbDisponivel(): boolean {
    return typeof navigator !== 'undefined' && 'usb' in navigator
}

// True quando o navegador tem WebSerial disponivel.
export function webSerialDisponivel(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator
}

// Devolve a 1a impressora pareada (USB ou Serial), ou null.
export async function obterImpressoraPareada(): Promise<ImpressoraPareada | null> {
    if (webUsbDisponivel()) {
        try {
            const devices = await navigator.usb.getDevices()
            if (devices.length > 0) return { tipo: 'usb', device: devices[0] }
        } catch {}
    }
    if (webSerialDisponivel()) {
        try {
            const ports = await navigator.serial.getPorts()
            if (ports.length > 0) return { tipo: 'serial', port: ports[0] }
        } catch {}
    }
    return null
}

// Pede ao usuario pra escolher impressora USB. Popup nativo do Chrome.
// Pode falhar com "Access Denied" no Windows se driver kernel-mode segura
// o device exclusivamente — nesse caso, use pedirImpressoraSerial().
export async function pedirImpressoraUSB(): Promise<USBDevice | null> {
    if (!webUsbDisponivel()) {
        throw new Error('WebUSB nao disponivel — abra o sistema no Chrome ou Edge.')
    }
    try {
        return await navigator.usb.requestDevice({ filters: PRINTER_USB_CLASS_FILTER })
    } catch (err: any) {
        if (err?.name === 'NotFoundError') return null
        throw err
    }
}

// Pede ao usuario pra escolher uma porta COM (serial). Popup do Chrome.
// Funciona quando o driver da impressora expoe porta serial virtual —
// o caminho recomendado no Windows quando WebUSB direto falha.
export async function pedirImpressoraSerial(): Promise<SerialPort | null> {
    if (!webSerialDisponivel()) {
        throw new Error('WebSerial nao disponivel — abra o sistema no Chrome ou Edge.')
    }
    try {
        return await navigator.serial.requestPort()
    } catch (err: any) {
        if (err?.name === 'NotFoundError') return null
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

    // QR-Code: usa o oficial (com hash CSC, vindo do XML autorizado) quando
    // disponível. Senão, fallback pra URL de consulta por chave (sem hash — não
    // valida na SEFAZ, mas imprime). Notas antigas não têm o QR salvo.
    const ambiente = dados.chaveAcesso.charAt(20) === '1' ? '1' : '2'
    const baseUrl = ambiente === '1'
        ? 'https://www.dfe.ms.gov.br/nfce/qrcode'
        : 'https://www.dfe.ms.gov.br/nfcehom/qrcode'
    const urlQrCode = dados.qrCodeUrl || `${baseUrl}?p=${dados.chaveAcesso}|2|${ambiente}|1`

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

    // Totais — quando há desconto, mostra Subtotal e Desconto antes do Total.
    const descCupom = dados.desconto && dados.desconto > 0 ? dados.desconto : 0
    if (descCupom > 0) {
        enc.line(linhaLR('Subtotal', formatBRL(dados.total + descCupom)))
        enc.line(linhaLR('Desconto', '-' + formatBRL(descCupom)))
    }

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

// Linha esquerda/direita justificada em `cols` colunas (rotulo a esquerda,
// valor colado na direita). Trunca o rotulo se necessario pra nunca estourar.
function linhaLR(esq: string, dir: string, cols = 48): string {
    const espacos = cols - esq.length - dir.length
    if (espacos < 1) {
        const corte = Math.max(0, cols - dir.length - 1)
        return esq.slice(0, corte) + ' ' + dir
    }
    return esq + ' '.repeat(espacos) + dir
}

// Constroi os bytes ESC/POS do comprovante de FECHAMENTO DE CAIXA em 80mm.
// Relatorio financeiro de conferencia do turno — cabecalho, vendas por forma,
// sangrias/reforcos, esperado x contado, diferenca e linha de assinatura.
function montarFechamentoEscPos(dados: DadosImpressaoFechamento): Uint8Array {
    const enc = new ReceiptPrinterEncoder({
        language: 'esc-pos',
        columns: 48,
        feedBeforeCut: 3,
        newline: '\n',
    })

    const sep = '-'.repeat(48)
    const sepForte = '='.repeat(48)

    enc
        .initialize()
        .align('center')
        .bold(true)
        .line(dados.razaoSocial)
        .bold(false)

    if (dados.cnpj) enc.size('small').line(`CNPJ: ${dados.cnpj}`).size('normal')

    enc
        .line(sep)
        .bold(true)
        .line('FECHAMENTO DE CAIXA')
        .bold(false)
        .line(sep)
        .align('left')
        .line(`Operador: ${dados.operador}`.slice(0, 48))
        .line(`Emitido:  ${dados.dataHora}`.slice(0, 48))
        .line(sep)
        .line(linhaLR('Fundo de troco', formatBRL(dados.aberturaValor)))
        .line(linhaLR(`Vendas (${dados.qtdVendas})`, formatBRL(dados.totalVendas)))
        .line(sep)
        .bold(true)
        .line('RECEBIMENTOS POR FORMA')
        .bold(false)
        .line(linhaLR('  Dinheiro', formatBRL(dados.totalDinheiro)))
        .line(linhaLR('  PIX', formatBRL(dados.totalPix)))
        .line(linhaLR('  Cartao Debito', formatBRL(dados.totalDebito)))
        .line(linhaLR('  Cartao Credito', formatBRL(dados.totalCredito)))
        .line(sep)
        .line(linhaLR('Sangrias', '- ' + formatBRL(dados.totalSangrias)))
        .line(linhaLR('Reforcos', '+ ' + formatBRL(dados.totalReforcos)))
        .line(sepForte)

    const dif = dados.diferenca
    const tagDif = dif === 0 ? 'CONFERE' : dif > 0 ? 'SOBRA' : 'FALTA'

    enc
        .bold(true)
        .line(linhaLR('ESPERADO EM DINHEIRO', formatBRL(dados.saldoEsperadoDinheiro)))
        .line(linhaLR('CONTADO', formatBRL(dados.valorContado)))
        .line(linhaLR(`DIFERENCA (${tagDif})`, formatBRL(Math.abs(dif))))
        .bold(false)
        .line(sepForte)

    if (dados.observacao && dados.observacao.trim().length > 0) {
        enc.align('left').line('Obs: ' + dados.observacao).line(sep)
    }

    enc
        .align('center')
        .newline()
        .line('_______________________')
        .line('Assinatura do responsavel')
        .newline()
        .newline()
        .cut('partial')

    return enc.encode()
}

// Envia bytes ESC/POS crus pra impressora pareada (USB ou Serial). Throw se falhar.
// Centraliza o transporte; quem decide o conteudo e o montador (NFC-e/fechamento).
async function enviarBytes(impressora: ImpressoraPareada, bytes: Uint8Array): Promise<void> {
    if (impressora.tipo === 'usb') {
        const { endpointNumber } = await prepararEndpointEscrita(impressora.device)
        const buffer = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(buffer).set(bytes)
        const result = await impressora.device.transferOut(endpointNumber, buffer)
        if (result.status !== 'ok') {
            throw new Error(`Falha ao enviar dados (status USB: ${result.status})`)
        }
        return
    }
    // SERIAL: abre porta, escreve bytes, fecha
    const port = impressora.port
    if (!port.readable) {
        // porta nao aberta — abre com baudrate padrao de termicas (9600 ou 38400)
        await port.open({ baudRate: 9600 })
    }
    const writer = port.writable!.getWriter()
    try {
        const buffer = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(buffer).set(bytes)
        await writer.write(new Uint8Array(buffer))
    } finally {
        writer.releaseLock()
    }
}

// Imprime o DANFE NFC-e enviando bytes ESC/POS pra qualquer impressora
// pareada (USB ou Serial). Throw se falhar.
export async function imprimirNFCe(impressora: ImpressoraPareada, dados: DadosImpressaoNFCe): Promise<void> {
    await enviarBytes(impressora, montarCupomEscPos(dados))
}

// Imprime o comprovante de FECHAMENTO DE CAIXA (relatorio do turno). Throw se falhar.
export async function imprimirFechamento(impressora: ImpressoraPareada, dados: DadosImpressaoFechamento): Promise<void> {
    await enviarBytes(impressora, montarFechamentoEscPos(dados))
}

// Formata a quantidade do item da nota: '10' pra unidade, '0,486kg' pra peso.
// (o separador ' x ' do preço é adicionado por quem monta a linha)
function formatQtdPedido(q: number, unidade?: string | null): string {
    const un = (unidade ?? '').toLowerCase()
    if (un === 'kg') return `${q.toFixed(3).replace('.', ',')}kg`
    return `${Number.isInteger(q) ? q : q.toFixed(3).replace('.', ',')}`
}

// Quebra texto em linhas de no maximo `cols` chars (sem cortar palavra quando
// possivel). Usado pras observacoes longas na nota de pedido.
function wrapTexto(texto: string, cols = 46): string[] {
    const palavras = texto.split(/\s+/)
    const linhas: string[] = []
    let atual = ''
    for (const p of palavras) {
        if ((atual + (atual ? ' ' : '') + p).length > cols) {
            if (atual) linhas.push(atual)
            atual = p.length > cols ? p.slice(0, cols) : p
        } else {
            atual = atual ? `${atual} ${p}` : p
        }
    }
    if (atual) linhas.push(atual)
    return linhas
}

// Constroi os bytes ESC/POS da NOTA DE PEDIDO em 80mm (48 colunas). Cabecalho
// com nome+CNPJ, tipo/destino, mesa/comanda/cliente (so quando preenchidos),
// itens em lista flat (2 linhas cada), total, forma de pagamento e observacoes.
function montarPedidoEscPos(dados: DadosImpressaoPedido): Uint8Array {
    const enc = new ReceiptPrinterEncoder({
        language: 'esc-pos',
        columns: 48,
        feedBeforeCut: 3,
        newline: '\n',
    })
    const sep = '-'.repeat(48)
    const sepForte = '='.repeat(48)

    enc
        .initialize()
        .align('center')
        .line(sepForte)
        .bold(true)
        .line(dados.razaoSocial)
        .bold(false)

    if (dados.cnpj) enc.size('small').line(`CNPJ: ${dados.cnpj}`).size('normal')

    enc
        .line(sepForte)
        .bold(true)
        .line('NOTA DE PEDIDO')
        .bold(false)
        .line(sep)
        .align('left')

    const tipo = dados.tipoPedido ? dados.tipoPedido.toUpperCase() : null
    const destino = dados.destino ? dados.destino.toUpperCase() : null
    if (tipo || destino) {
        enc.line(linhaLR(tipo ? `Tipo: ${tipo}` : '', destino ? `Destino: ${destino}` : ''))
    }
    if (dados.numeroMesa != null || dados.comandaNumero != null) {
        enc.line(linhaLR(
            dados.numeroMesa != null ? `Mesa: ${dados.numeroMesa}` : '',
            dados.comandaNumero != null ? `Comanda: ${dados.comandaNumero}` : '',
        ))
    }
    if (dados.clienteNome) enc.line(`Cliente: ${dados.clienteNome}`.slice(0, 48))

    enc.line(sep)
    dados.itens.forEach((item) => {
        enc.line(item.nome.slice(0, 48))
        const esq = `  ${formatQtdPedido(item.quantidade, item.unidadeMedida)} x ${formatBRL(item.precoUnitario)}`
        enc.line(linhaLR(esq, formatBRL(item.subtotal)))
    })
    enc.line(sep)
    enc.bold(true).line(linhaLR('TOTAL', `R$ ${formatBRL(dados.total)}`)).bold(false)

    if (dados.formaPagamentoLabel) {
        enc.line(sep).line(`Pagamento: ${dados.formaPagamentoLabel}`)
    }
    if (dados.observacoes && dados.observacoes.trim()) {
        enc.line(sep)
        wrapTexto(`Obs: ${dados.observacoes.trim()}`, 48).forEach((l) => enc.line(l))
    }

    enc
        .line(sep)
        .align('center')
        .size('small')
        .line(dados.dataHora)
        .size('normal')
        .line(sepForte)
        .newline()
        .newline()
        .cut('partial')

    return enc.encode()
}

// Imprime a NOTA DE PEDIDO (comanda/comprovante nao-fiscal). Throw se falhar.
export async function imprimirPedido(impressora: ImpressoraPareada, dados: DadosImpressaoPedido): Promise<void> {
    await enviarBytes(impressora, montarPedidoEscPos(dados))
}
