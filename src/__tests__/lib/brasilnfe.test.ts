import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { emitirNFCe, extrairQrCodeNFCe, type ItemNFCe } from '@/lib/brasilnfe'

// Regressão da rejeição de troco (865/866): o VlPago enviado à SEFAZ DEVE ser
// igual ao total fiscal (vNF), que o integrador calcula item a item
// (Σ round2(qtd × valorUnitário)). O bug antigo mandava VlPago = dados.total,
// somado sem arredondar por item (drift de centavo em itens por peso/kg).

const OK_RESPONSE = {
    ReturnNF: {
        Ok: true,
        ChaveNF: '5'.repeat(44),
        CodStatusRespostaSefaz: '100',
    },
}

function mockFetchCapturing() {
    const calls: { url: string; body: any }[] = []
    const fn = vi.fn(async (url: string, init: any) => {
        calls.push({ url, body: JSON.parse(init.body) })
        return { ok: true, status: 200, json: async () => OK_RESPONSE } as unknown as Response
    })
    vi.stubGlobal('fetch', fn)
    return calls
}

const round2 = (n: number) => Math.round(n * 100) / 100

describe('emitirNFCe — VlPago bate com o total fiscal (vNF)', () => {
    beforeEach(() => {
        process.env.BRASIL_NFE_URL = 'https://api.test'
        process.env.BRASIL_NFE_TOKEN = 'tok'
        process.env.BRASIL_NFE_AMBIENTE = '2'
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('VlPago vem dos itens, ignorando um total divergente (causa raiz do bug)', async () => {
        const calls = mockFetchCapturing()
        const itens: ItemNFCe[] = [
            { codigo: 'CAFE', nome: 'Cafe', quantidade: 1, valorUnitario: 10, unidade: 'UN' },
        ]
        // total propositalmente errado: o fix deve ignorá-lo e usar a soma dos itens.
        const res = await emitirNFCe({ itens, total: 99.99, formaPagamento: 'dinheiro' })

        expect(res.ok).toBe(true)
        const pag = calls[0].body.Pagamentos[0]
        expect(pag.VlPago).toBe(10)
        expect(pag.VlPago).not.toBe(99.99)
        expect(pag.VlTroco).toBe(0)
    })

    it('itens por peso: VlPago === round2(Σ ValorTotal), sem drift de centavo', async () => {
        const calls = mockFetchCapturing()
        // 0,350 kg × R$49,90/kg = 17,465 por item → arredonda por item.
        const itens: ItemNFCe[] = [
            { codigo: 'PAO', nome: 'Pao', quantidade: 0.350, valorUnitario: 49.9, unidade: 'kg' },
            { codigo: 'PAO', nome: 'Pao', quantidade: 0.350, valorUnitario: 49.9, unidade: 'kg' },
        ]
        // "total" como o CarrinhoLateral somava (sem arredondar por item):
        const totalCru = round2(itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0))

        const res = await emitirNFCe({ itens, total: totalCru, formaPagamento: 'pix' })
        expect(res.ok).toBe(true)

        const body = calls[0].body
        const vNF = round2(body.Produtos.reduce((s: number, p: any) => s + p.ValorTotal, 0))

        // A invariante fiscal: pagamento === total da nota calculado item a item.
        expect(body.Pagamentos[0].VlPago).toBe(vNF)
        // E cada ValorTotal foi arredondado por item.
        for (const p of body.Produtos) {
            expect(p.ValorTotal).toBe(round2(p.ValorTotal))
        }
    })

    it('itens inteiros continuam corretos (sem regressão)', async () => {
        const calls = mockFetchCapturing()
        const itens: ItemNFCe[] = [
            { codigo: 'A', nome: 'Cafe', quantidade: 2, valorUnitario: 5, unidade: 'UN' },
            { codigo: 'B', nome: 'Bolo', quantidade: 1, valorUnitario: 8.5, unidade: 'UN' },
        ]
        const res = await emitirNFCe({ itens, total: 18.5, formaPagamento: 'credito' })
        expect(res.ok).toBe(true)
        expect(calls[0].body.Pagamentos[0].VlPago).toBe(18.5)
    })
})

// A forma de pagamento vira o código tPag da SEFAZ. Voucher (cartão de
// benefício) foi mapeado para 99 (Outros) por decisão do dono. Garante que o
// código correto viaja no payload — e que as formas existentes não regridem.
describe('emitirNFCe — tPag (FormaPagamento) por forma', () => {
    beforeEach(() => {
        process.env.BRASIL_NFE_URL = 'https://api.test'
        process.env.BRASIL_NFE_TOKEN = 'tok'
        process.env.BRASIL_NFE_AMBIENTE = '2'
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    const itens: ItemNFCe[] = [
        { codigo: 'A', nome: 'Item', quantidade: 1, valorUnitario: 10, unidade: 'UN' },
    ]

    it.each([
        ['dinheiro', '01'],
        ['credito', '03'],
        ['debito', '04'],
        ['pix', '17'],
        ['voucher', '99'],
    ])('forma "%s" → tPag %s', async (forma, esperado) => {
        const calls = mockFetchCapturing()
        const res = await emitirNFCe({ itens, total: 10, formaPagamento: forma })
        expect(res.ok).toBe(true)
        expect(calls[0].body.Pagamentos[0].FormaPagamento).toBe(esperado)
    })
})

// Regressão "CSOSN indevido" (Suco Laranja Prats 300 cadastrado como 0900) e
// "Rejeição 806" (sucos como 0500 sem CEST): a emissão só sabe montar o ICMS do
// CSOSN 102. Qualquer outro código deve ser coagido para 102, em vez de derrubar
// a nota na SEFAZ. O ICMS sempre sai com CodSituacaoTributaria suportado.
describe('emitirNFCe — CSOSN coagido para o que a emissão suporta', () => {
    beforeEach(() => {
        process.env.BRASIL_NFE_URL = 'https://api.test'
        process.env.BRASIL_NFE_TOKEN = 'tok'
        process.env.BRASIL_NFE_AMBIENTE = '2'
        // silencia o console.warn esperado da coerção
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    const csosnEnviado = (calls: { body: any }[]) =>
        calls[0].body.Produtos[0].Imposto.ICMS.CodSituacaoTributaria

    it('0102 (suportado) é enviado como 102', async () => {
        const calls = mockFetchCapturing()
        const itens: ItemNFCe[] = [{ codigo: 'X', nome: 'Pao', quantidade: 1, valorUnitario: 5, csosn: '0102' }]
        const res = await emitirNFCe({ itens, total: 5, formaPagamento: 'dinheiro' })
        expect(res.ok).toBe(true)
        expect(csosnEnviado(calls)).toBe('102')
    })

    it('0900 ("Outros", causa do erro reportado) é coagido para 102', async () => {
        const calls = mockFetchCapturing()
        const itens: ItemNFCe[] = [{ codigo: 'SUCO', nome: 'Suco Laranja Prats 300', quantidade: 1, valorUnitario: 6, csosn: '0900' }]
        const res = await emitirNFCe({ itens, total: 6, formaPagamento: 'dinheiro' })
        expect(res.ok).toBe(true)
        expect(csosnEnviado(calls)).toBe('102')
    })

    it('0500 (ICMS-ST sem CEST) é coagido para 102', async () => {
        const calls = mockFetchCapturing()
        const itens: ItemNFCe[] = [{ codigo: 'SUCO', nome: 'Suco caju Prats', quantidade: 1, valorUnitario: 6, csosn: '0500' }]
        const res = await emitirNFCe({ itens, total: 6, formaPagamento: 'dinheiro' })
        expect(res.ok).toBe(true)
        expect(csosnEnviado(calls)).toBe('102')
    })

    it('csosn ausente cai no default 102', async () => {
        const calls = mockFetchCapturing()
        const itens: ItemNFCe[] = [{ codigo: 'A', nome: 'Cafe', quantidade: 1, valorUnitario: 5 }]
        const res = await emitirNFCe({ itens, total: 5, formaPagamento: 'pix' })
        expect(res.ok).toBe(true)
        expect(csosnEnviado(calls)).toBe('102')
    })
})

// QR-Code oficial: o cupom precisa imprimir o <qrCode> do XML autorizado (a URL
// completa COM o hash CSC), porque a chave de acesso sozinha não permite remontar
// o hash. extrairQrCodeNFCe decodifica o Base64Xml e puxa infNFeSupl/qrCode.
const QR_URL =
    'https://www.dfe.ms.gov.br/nfce/qrcode?p=' +
    '5'.repeat(44) + '|2|1|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01'

function xmlAutorizado(qrCode: string, urlChave = 'www.dfe.ms.gov.br/nfce'): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${'5'.repeat(44)}"><ide></ide></infNFe>
    <infNFeSupl>
      <qrCode>${qrCode}</qrCode>
      <urlChave>${urlChave}</urlChave>
    </infNFeSupl>
  </NFe>
  <protNFe><infProt><cStat>100</cStat></infProt></protNFe>
</nfeProc>`
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

describe('extrairQrCodeNFCe — puxa o QR oficial do XML autorizado', () => {
    it('extrai qrCode escapado (entidades XML) e urlChave', () => {
        // No XML real o & vira &amp;; aqui o QR usa só | então testo o caminho escaped puro.
        const xml = xmlAutorizado(QR_URL)
        const { qrCodeUrl, urlChave } = extrairQrCodeNFCe(b64(xml))
        expect(qrCodeUrl).toBe(QR_URL)
        expect(urlChave).toBe('www.dfe.ms.gov.br/nfce')
    })

    it('extrai qrCode em CDATA', () => {
        const xml = xmlAutorizado(`<![CDATA[${QR_URL}]]>`)
        const { qrCodeUrl } = extrairQrCodeNFCe(b64(xml))
        expect(qrCodeUrl).toBe(QR_URL)
    })

    it('desescapa &amp; dentro do qrCode (URL com query string composta)', () => {
        const comAmp = `${QR_URL}&extra=1`
        const xml = xmlAutorizado(comAmp.replace(/&/g, '&amp;'))
        const { qrCodeUrl } = extrairQrCodeNFCe(b64(xml))
        expect(qrCodeUrl).toBe(comAmp)
    })

    it('tolera prefixo de namespace na tag (<ns:qrCode>)', () => {
        const xml = `<root><ns:infNFeSupl><ns:qrCode>${QR_URL}</ns:qrCode></ns:infNFeSupl></root>`
        const { qrCodeUrl } = extrairQrCodeNFCe(b64(xml))
        expect(qrCodeUrl).toBe(QR_URL)
    })

    it('base64 ausente/vazio → objeto vazio (cai no fallback)', () => {
        expect(extrairQrCodeNFCe(undefined)).toEqual({})
        expect(extrairQrCodeNFCe(null)).toEqual({})
        expect(extrairQrCodeNFCe('')).toEqual({})
    })

    it('XML sem infNFeSupl → qrCodeUrl undefined', () => {
        const xml = '<nfeProc><NFe><infNFe></infNFe></NFe></nfeProc>'
        const { qrCodeUrl } = extrairQrCodeNFCe(b64(xml))
        expect(qrCodeUrl).toBeUndefined()
    })
})

describe('emitirNFCe — propaga o qrCodeUrl quando a Brasil NFe devolve o XML', () => {
    beforeEach(() => {
        process.env.BRASIL_NFE_URL = 'https://api.test'
        process.env.BRASIL_NFE_TOKEN = 'tok'
        process.env.BRASIL_NFE_AMBIENTE = '2'
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('retorna qrCodeUrl extraído do Base64Xml da resposta', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                ReturnNF: { Ok: true, ChaveNF: '5'.repeat(44), CodStatusRespostaSefaz: '100' },
                Base64Xml: b64(xmlAutorizado(QR_URL)),
            }),
        }) as unknown as Response))

        const itens: ItemNFCe[] = [{ codigo: 'A', nome: 'Cafe', quantidade: 1, valorUnitario: 5 }]
        const res = await emitirNFCe({ itens, total: 5, formaPagamento: 'dinheiro' })
        expect(res.ok).toBe(true)
        expect(res.qrCodeUrl).toBe(QR_URL)
    })

    it('sem Base64Xml na resposta, qrCodeUrl fica undefined (sem quebrar)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                ReturnNF: { Ok: true, ChaveNF: '5'.repeat(44), CodStatusRespostaSefaz: '100' },
            }),
        }) as unknown as Response))

        const itens: ItemNFCe[] = [{ codigo: 'A', nome: 'Cafe', quantidade: 1, valorUnitario: 5 }]
        const res = await emitirNFCe({ itens, total: 5, formaPagamento: 'dinheiro' })
        expect(res.ok).toBe(true)
        expect(res.qrCodeUrl).toBeUndefined()
    })
})
