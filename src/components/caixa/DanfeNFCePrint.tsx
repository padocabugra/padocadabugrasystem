'use client'

import { QRCodeSVG } from 'qrcode.react'
import { formatCurrency } from '@/lib/formatters'

// Layout do DANFE NFC-e (cupom fiscal) pra impressao termica 80mm.
// O componente renderiza um #danfe-print escondido (display none na tela)
// que so aparece em @media print — global CSS em globals.css cuida disso.
//
// CNPJ e demais dados da empresa vem das envs NEXT_PUBLIC_EMPRESA_*.
// Fallback: extrai CNPJ direto da chave de acesso (digitos 7-20).

interface ItemDanfe {
    quantidade: number
    preco_unitario: number
    subtotal: number
    produto: { nome: string; codigo?: string | null } | null
}

interface Props {
    chaveAcesso: string
    itens: ItemDanfe[]
    total: number
    valorPago: number
    troco: number
    formaPagamentoLabel: string
    dataHora: string
    cpfCliente?: string
}

// Extrai CNPJ da chave de acesso (44 digitos): UF(2) AAMM(4) CNPJ(14) ...
function cnpjDaChave(chave: string): string {
    const apenasDigitos = chave.replace(/\D/g, '')
    if (apenasDigitos.length < 20) return ''
    const cnpj = apenasDigitos.slice(6, 20)
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

function formatarChave(chave: string): string {
    return chave.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ')
}

// URL de consulta NFC-e da SEFAZ-MS. Formato basico que abre a pagina
// de consulta publica. O QR-Code "oficial" da SEFAZ inclui hash com
// CSC; quando a Brasil NFe retornar essa URL no response usamos ela.
function urlConsultaSefazMS(chave: string): string {
    const ambiente = chave.charAt(20) === '1' ? '1' : '2'
    const baseUrl = ambiente === '1'
        ? 'https://www.dfe.ms.gov.br/nfce/qrcode'
        : 'https://www.dfe.ms.gov.br/nfcehom/qrcode'
    return `${baseUrl}?p=${chave}|2|${ambiente}|1`
}

export default function DanfeNFCePrint({
    chaveAcesso,
    itens,
    total,
    valorPago,
    troco,
    formaPagamentoLabel,
    dataHora,
    cpfCliente,
}: Props) {
    const razaoSocial = process.env.NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL || 'BUGRA LTDA'
    const cnpj = process.env.NEXT_PUBLIC_EMPRESA_CNPJ || cnpjDaChave(chaveAcesso)
    const ie = process.env.NEXT_PUBLIC_EMPRESA_IE || ''
    const endereco = process.env.NEXT_PUBLIC_EMPRESA_ENDERECO || ''

    const urlQrCode = urlConsultaSefazMS(chaveAcesso)
    const chaveFormatada = formatarChave(chaveAcesso)

    return (
        <div id="danfe-print" style={{ display: 'none' }}>
            {/* Cabecalho da empresa */}
            <div style={{ textAlign: 'center', marginBottom: '2mm' }}>
                <div style={{ fontWeight: 'bold', fontSize: '10pt' }}>{razaoSocial}</div>
                {cnpj && <div>CNPJ: {cnpj}</div>}
                {ie && <div>IE: {ie}</div>}
                {endereco && <div style={{ fontSize: '8pt' }}>{endereco}</div>}
            </div>

            <div style={{ borderTop: '1px dashed black', margin: '2mm 0' }} />

            {/* Identificacao da NFC-e */}
            <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '2mm' }}>
                DANFE NFC-e<br />
                Documento Auxiliar da Nota Fiscal de Consumidor Eletronica
            </div>

            <div style={{ borderTop: '1px dashed black', margin: '2mm 0' }} />

            {/* Tabela de itens */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '8pt' }}>
                <span>ITEM</span>
                <span>QTD x UNIT</span>
                <span>TOTAL</span>
            </div>
            <div style={{ borderTop: '1px solid black', marginBottom: '1mm' }} />
            {itens.map((item, i) => {
                const nome = item.produto?.nome ?? 'Produto'
                const codigo = item.produto?.codigo ?? ''
                return (
                    <div key={i} style={{ marginBottom: '1mm' }}>
                        <div style={{ fontSize: '8pt' }}>
                            {String(i + 1).padStart(3, '0')} {codigo && `[${codigo}] `}{nome}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8pt' }}>
                            <span>{item.quantidade} x {formatCurrency(item.preco_unitario)}</span>
                            <span style={{ fontWeight: 'bold' }}>{formatCurrency(item.subtotal)}</span>
                        </div>
                    </div>
                )
            })}

            <div style={{ borderTop: '1px dashed black', margin: '2mm 0' }} />

            {/* Totais */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10pt', fontWeight: 'bold' }}>
                <span>TOTAL R$</span>
                <span>{formatCurrency(total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8pt' }}>
                <span>{formaPagamentoLabel}</span>
                <span>{formatCurrency(valorPago)}</span>
            </div>
            {troco > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8pt' }}>
                    <span>Troco</span>
                    <span>{formatCurrency(troco)}</span>
                </div>
            )}

            <div style={{ borderTop: '1px dashed black', margin: '2mm 0' }} />

            {/* CPF na nota (se informado) */}
            {cpfCliente && (
                <div style={{ textAlign: 'center', fontSize: '8pt', marginBottom: '2mm' }}>
                    CPF/CNPJ Consumidor: {cpfCliente}
                </div>
            )}

            {/* Aviso fiscal */}
            <div style={{ textAlign: 'center', fontSize: '8pt', marginBottom: '2mm' }}>
                Consulte pela Chave de Acesso em:<br />
                <strong>www.dfe.ms.gov.br/nfce</strong>
            </div>

            {/* Chave de acesso */}
            <div style={{ textAlign: 'center', fontSize: '7pt', marginBottom: '2mm' }}>
                CHAVE DE ACESSO<br />
                <span style={{ fontFamily: 'Courier New, monospace', wordBreak: 'break-all' }}>
                    {chaveFormatada}
                </span>
            </div>

            {/* QR-Code */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '2mm 0' }}>
                <QRCodeSVG value={urlQrCode} size={140} level="M" includeMargin={false} />
            </div>

            {/* Data/hora */}
            <div style={{ textAlign: 'center', fontSize: '7pt', marginTop: '2mm' }}>
                Emitido em {dataHora}
            </div>
        </div>
    )
}
