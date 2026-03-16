import Papa from 'papaparse'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
