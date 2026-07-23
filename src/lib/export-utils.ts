import Papa from 'papaparse'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency } from './formatters'
import type { LinhaNotaFiscal } from './chave-nfce'

interface ExportConfig {
    filename: string
    title: string
    subtitle?: string
    periodo?: string
}

export function exportToCSV(data: Record<string, any>[], config: ExportConfig) {
    if (data.length === 0) return

    const csv = Papa.unparse(data, { delimiter: ';' })
    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${config.filename}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

export function exportToPDF(
    headers: string[],
    rows: (string | number)[][],
    config: ExportConfig
) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

    // Header
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('PADOCA CRM', 14, 15)

    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(config.title, 14, 23)

    if (config.subtitle) {
        doc.setFontSize(9)
        doc.setTextColor(120, 120, 120)
        doc.text(config.subtitle, 14, 29)
    }

    if (config.periodo) {
        doc.setFontSize(8)
        doc.setTextColor(100, 100, 100)
        doc.text(`Período: ${config.periodo}`, 14, config.subtitle ? 34 : 29)
    }

    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    const dataGeracao = new Date().toLocaleString('pt-BR')
    doc.text(`Gerado em: ${dataGeracao}`, doc.internal.pageSize.getWidth() - 14, 15, { align: 'right' })

    // Table
    autoTable(doc, {
        head: [headers],
        body: rows,
        startY: config.subtitle ? 38 : config.periodo ? 33 : 28,
        theme: 'grid',
        headStyles: {
            fillColor: [37, 99, 235],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 8,
        },
        bodyStyles: {
            fontSize: 7.5,
        },
        alternateRowStyles: {
            fillColor: [245, 247, 250],
        },
        margin: { top: 10, left: 14, right: 14 },
        styles: {
            cellPadding: 3,
            overflow: 'linebreak',
        },
    })

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(7)
        doc.setTextColor(150)
        doc.text(
            `Página ${i} de ${pageCount}`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 8,
            { align: 'center' }
        )
    }

    doc.save(`${config.filename}.pdf`)
}

// ─── Relatório de Notas Fiscais (contabilidade) ──────────────────────────────

interface NotasFiscaisPdfConfig {
    empresa: string       // razão social
    cnpj?: string
    periodo: string       // "01/07/2026 a 31/07/2026"
    filename: string
}

/**
 * PDF profissional do relatório de NFC-e emitidas, pensado pra contabilidade.
 *
 * Layout à prova de "cortado": A4 paisagem, larguras de coluna FIXAS e a chave
 * de 44 dígitos numa fonte monoespaçada (courier) numa coluna larga o bastante
 * pra caber numa linha só — sem quebra, sem estouro. Fecha com uma linha de
 * TOTAIS (quantidade de notas + soma dos valores).
 */
export function exportNotasFiscaisPDF(linhas: LinhaNotaFiscal[], config: NotasFiscaisPdfConfig) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()

    // ── Cabeçalho timbrado ──
    doc.setFontSize(15)
    doc.setFont('helvetica', 'bold')
    doc.text(config.empresa, 14, 15)

    if (config.cnpj) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(90, 90, 90)
        doc.text(`CNPJ: ${config.cnpj}`, 14, 20.5)
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(20, 20, 20)
    doc.text('Relatório de Notas Fiscais Emitidas (NFC-e)', 14, config.cnpj ? 27 : 23)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Período: ${config.periodo}`, 14, config.cnpj ? 32.5 : 28.5)

    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageW - 14, 15, { align: 'right' })

    const total = linhas.reduce((s, l) => s + l.valor, 0)

    autoTable(doc, {
        startY: config.cnpj ? 37 : 33,
        head: [['Data', 'Hora', 'Número', 'Série', 'Chave de Acesso (44 dígitos)', 'Valor', 'Situação']],
        body: linhas.map((l) => [
            l.data,
            l.hora,
            l.numero,
            l.serie,
            l.chave,
            formatCurrency(l.valor),
            l.situacao,
        ]),
        foot: [[
            { content: `TOTAL — ${linhas.length} nota(s)`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
            { content: formatCurrency(total), styles: { halign: 'right', fontStyle: 'bold' } },
            { content: '', styles: {} },
        ]],
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'left' },
        footStyles: { fillColor: [235, 240, 250], textColor: 20, fontSize: 8.5 },
        bodyStyles: { fontSize: 8, cellPadding: 2.2, overflow: 'linebreak' },
        alternateRowStyles: { fillColor: [246, 248, 251] },
        margin: { top: 10, left: 14, right: 14 },
        // Larguras fixas: a chave ganha espaço e fonte monoespaçada pra caber
        // inteira numa linha; valores à direita, número/série centrados.
        columnStyles: {
            0: { cellWidth: 22 },                                   // Data
            1: { cellWidth: 14 },                                   // Hora
            2: { cellWidth: 22, halign: 'right' },                  // Número
            3: { cellWidth: 14, halign: 'center' },                 // Série
            4: { cellWidth: 96, font: 'courier', fontSize: 8 },     // Chave (monoespaçada)
            5: { cellWidth: 30, halign: 'right' },                  // Valor
            6: { cellWidth: 26, halign: 'center' },                 // Situação
        },
    })

    // Rodapé com paginação
    const pageCount = (doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(7)
        doc.setTextColor(150)
        doc.text(
            `Página ${i} de ${pageCount}`,
            pageW / 2,
            doc.internal.pageSize.getHeight() - 8,
            { align: 'center' }
        )
    }

    doc.save(`${config.filename}.pdf`)
}
