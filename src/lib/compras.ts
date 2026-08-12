/**
 * Relatório de NOTAS DE COMPRA (entradas de estoque) para a contabilidade.
 *
 * A RPC `fn_relatorio_compras` já entrega uma linha por NOTA; aqui a gente
 * separa o que é nota fiscal do que é entrada sem NF, calcula os totais e o
 * resumo por fornecedor — tudo puro, para ser testável e reaproveitado pela
 * tela e pelos exports (PDF/CSV).
 */

/** Linha crua vinda da RPC. `date` chega como 'YYYY-MM-DD'; numeric como string. */
export interface CompraRaw {
    data_compra: string | null
    numero_nota_fiscal: string | null
    fornecedor: string | null
    qtd_itens: number | string
    itens_sem_valor: number | string
    fornecedores_distintos: number | string
    valor_total: number | string
}

export interface LinhaCompra {
    dataISO: string
    data: string                    // dd/mm/aaaa
    numero: string
    fornecedor: string
    qtdItens: number
    itensSemValor: number
    fornecedoresDistintos: number   // >1 = grafias divergentes na mesma nota
    valor: number
}

export interface ResumoPorFornecedor {
    fornecedor: string
    notas: number
    valor: number
}

export interface ResumoCompras {
    notas: LinhaCompra[]
    total: number
    qtdNotas: number
    qtdFornecedores: number
    itensSemValor: number           // itens lançados sem preço (total subestimado)
    notasComDivergencia: number     // notas com grafia de fornecedor divergente
    semNf: { itens: number; valor: number }
    porFornecedor: ResumoPorFornecedor[]
}

const SEM_FORNECEDOR = 'Não informado'

/**
 * Data 'YYYY-MM-DD' → 'dd/mm/aaaa' por manipulação de STRING.
 * Nunca usar `new Date('YYYY-MM-DD')`: isso é lido como UTC e "volta um dia"
 * no nosso fuso (pegadinha conhecida do projeto).
 */
export function formatDataBR(iso: string | null | undefined): string {
    if (!iso) return '—'
    const ymd = String(iso).slice(0, 10)
    const [a, m, d] = ymd.split('-')
    return a && m && d ? `${d}/${m}/${a}` : '—'
}

/** Chave de comparação de fornecedor: minúsculas, espaços colapsados, sem ponto final. */
export function normalizarFornecedor(nome: string | null | undefined): string {
    return (nome ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/\.+$/, '')
}

export function montarLinhasCompras(rows: CompraRaw[]): LinhaCompra[] {
    return rows
        .filter((r) => r.numero_nota_fiscal)
        .map((r) => ({
            dataISO: String(r.data_compra ?? '').slice(0, 10),
            data: formatDataBR(r.data_compra),
            numero: String(r.numero_nota_fiscal),
            fornecedor: (r.fornecedor ?? '').trim() || SEM_FORNECEDOR,
            qtdItens: Number(r.qtd_itens) || 0,
            itensSemValor: Number(r.itens_sem_valor) || 0,
            fornecedoresDistintos: Number(r.fornecedores_distintos) || 0,
            valor: Number(r.valor_total) || 0,
        }))
}

/**
 * Consolida o retorno da RPC: notas, totais, alertas de qualidade do
 * lançamento e o resumo por fornecedor (ordenado por valor decrescente).
 */
export function resumirCompras(rows: CompraRaw[]): ResumoCompras {
    const notas = montarLinhasCompras(rows)

    const semNfRows = rows.filter((r) => !r.numero_nota_fiscal)
    const semNf = {
        itens: semNfRows.reduce((s, r) => s + (Number(r.qtd_itens) || 0), 0),
        valor: semNfRows.reduce((s, r) => s + (Number(r.valor_total) || 0), 0),
    }

    // Agrupa por fornecedor normalizado, exibindo a grafia mais frequente
    // (o mesmo fornecedor aparece escrito de formas diferentes entre notas).
    const mapa = new Map<string, { grafias: Map<string, number>; notas: number; valor: number }>()
    for (const n of notas) {
        const chave = normalizarFornecedor(n.fornecedor) || SEM_FORNECEDOR.toLowerCase()
        const atual = mapa.get(chave) ?? { grafias: new Map(), notas: 0, valor: 0 }
        atual.grafias.set(n.fornecedor, (atual.grafias.get(n.fornecedor) ?? 0) + 1)
        atual.notas += 1
        atual.valor += n.valor
        mapa.set(chave, atual)
    }

    const porFornecedor: ResumoPorFornecedor[] = [...mapa.values()]
        .map((v) => ({
            fornecedor: [...v.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0],
            notas: v.notas,
            valor: v.valor,
        }))
        .sort((a, b) => b.valor - a.valor)

    return {
        notas,
        total: notas.reduce((s, n) => s + n.valor, 0),
        qtdNotas: notas.length,
        qtdFornecedores: porFornecedor.length,
        itensSemValor: notas.reduce((s, n) => s + n.itensSemValor, 0),
        notasComDivergencia: notas.filter((n) => n.fornecedoresDistintos > 1).length,
        semNf,
        porFornecedor,
    }
}
