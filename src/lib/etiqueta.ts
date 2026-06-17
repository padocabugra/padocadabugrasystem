import JsBarcode from 'jsbarcode'
import { isValidEAN13, formatCurrency } from '@/lib/formatters'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Escolhe a simbologia do código de barras de forma automática (sem o usuário
 * decidir nada):
 *   - 13 dígitos com checksum válido → EAN-13 (padrão de mercado / industrializados).
 *   - qualquer outra coisa           → CODE128 (aceita letras e símbolos, ex.: PAO-FRA).
 * Função PURA — fácil de testar, não toca no DOM.
 */
export function escolherFormatoBarcode(codigo: string | null | undefined): 'EAN13' | 'CODE128' {
    return isValidEAN13((codigo ?? '').trim()) ? 'EAN13' : 'CODE128'
}

/**
 * Gera o SVG (string) do código de barras de um código. Retorna '' se o código
 * for vazio ou se a geração falhar. Só roda no browser (precisa de `document`).
 */
export function gerarBarcodeSVG(
    codigo: string | null | undefined,
    opts: { width?: number; height?: number; fontSize?: number } = {},
): string {
    const valor = (codigo ?? '').trim()
    if (!valor || typeof document === 'undefined') return ''
    try {
        const svg = document.createElementNS(SVG_NS, 'svg')
        JsBarcode(svg, valor, {
            format: escolherFormatoBarcode(valor),
            width: opts.width ?? 2,
            height: opts.height ?? 38,
            fontSize: opts.fontSize ?? 13,
            margin: 2,
            displayValue: true,
        })
        return svg.outerHTML
    } catch {
        return ''
    }
}

export interface ItemEtiqueta {
    nome: string
    codigo: string | null | undefined
    preco: number
}

export interface OpcoesEtiqueta {
    larguraMm: number
    alturaMm: number
    /** true = grade numa folha A4; false = uma etiqueta por página (etiquetadora de rolo). */
    folhaA4: boolean
    copias: number
    mostrarNome: boolean
    mostrarPreco: boolean
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
    )
}

function cssEtiqueta(o: OpcoesEtiqueta): string {
    const base = `
        * { box-sizing: border-box; }
        .etq {
            width: ${o.larguraMm}mm; height: ${o.alturaMm}mm;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 1mm; overflow: hidden; text-align: center;
        }
        .etq .nome { font-size: 8pt; font-weight: 700; line-height: 1.1; max-width: 100%;
                     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .etq .bc { display: flex; justify-content: center; }
        .etq .bc svg { max-width: 100%; height: auto; }
        .etq .preco { font-size: 9pt; font-weight: 800; margin-top: 0.5mm; }
    `
    if (o.folhaA4) {
        return `
            @page { size: A4; margin: 8mm; }
            body { margin: 0; font-family: Arial, Helvetica, sans-serif;
                   display: flex; flex-wrap: wrap; gap: 2mm; align-content: flex-start; }
            .etq { border: 0.2mm dashed #bbb; }
            ${base}
        `
    }
    return `
        @page { size: ${o.larguraMm}mm ${o.alturaMm}mm; margin: 0; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
        .etq { page-break-after: always; }
        ${base}
    `
}

/**
 * Monta o HTML completo (autossuficiente) com todas as etiquetas, pronto pra
 * ser escrito numa nova janela e impresso. Produtos sem código são pulados e
 * devolvidos em `ignorados` pra avisar o usuário.
 */
export function construirHtmlImpressao(
    itens: ItemEtiqueta[],
    opts: OpcoesEtiqueta,
): { html: string; ignorados: string[] } {
    const ignorados: string[] = []
    const blocos: string[] = []

    for (const item of itens) {
        const svg = gerarBarcodeSVG(item.codigo, {
            width: 2,
            height: Math.max(28, Math.round(opts.alturaMm * 1.0)),
            fontSize: 11,
        })
        if (!svg) {
            ignorados.push(item.nome)
            continue
        }
        const etiqueta =
            `<div class="etq">` +
            (opts.mostrarNome ? `<div class="nome">${escapeHtml(item.nome)}</div>` : '') +
            `<div class="bc">${svg}</div>` +
            (opts.mostrarPreco ? `<div class="preco">${escapeHtml(formatCurrency(item.preco))}</div>` : '') +
            `</div>`
        for (let i = 0; i < opts.copias; i++) blocos.push(etiqueta)
    }

    const html =
        `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">` +
        `<title>Etiquetas</title><style>${cssEtiqueta(opts)}</style></head>` +
        `<body>${blocos.join('')}` +
        `<script>window.onload=function(){window.focus();window.print();}</script>` +
        `</body></html>`

    return { html, ignorados }
}
