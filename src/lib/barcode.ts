import type { Produto } from '@/lib/types'

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

export type ResultadoBusca =
    | { tipo: 'exato'; produto: Produto }
    | { tipo: 'unico'; produto: Produto }
    | { tipo: 'nenhum' }
    | { tipo: 'multiplos'; quantidade: number }

/**
 * Decide o que fazer quando o operador aperta Enter no campo de busca do
 * PDV / catálogo — seja digitando à mão, seja BIPANDO um leitor de código de
 * barras USB (que apenas "digita" os dígitos e manda um Enter no final; pro
 * sistema é indistinguível de um teclado muito rápido).
 *
 * Ordem das regras:
 *   1. 'exato'     → algum produto tem o `codigo` idêntico ao termo
 *                    (EAN-13 da embalagem ou SKU interno). É o caso da bipagem.
 *   2. 'unico'     → não houve código idêntico, mas a busca por nome OU código
 *                    deixou exatamente 1 produto. Conveniência da digitação manual.
 *   3. 'nenhum'    → nada bateu (ou termo vazio).
 *   4. 'multiplos' → vários produtos batem; ambíguo, não adiciona nada.
 *
 * Função PURA: não toca em estado React, DOM nem áudio — fácil de testar e
 * reaproveitar em qualquer tela de venda.
 */
export function resolverBusca(produtos: Produto[], termoRaw: string): ResultadoBusca {
    const termo = norm(termoRaw)
    if (!termo) return { tipo: 'nenhum' }

    // 1. Match exato por código (prioridade — é exatamente o que o scanner produz).
    const exato = produtos.find((p) => {
        const c = norm(p.codigo)
        return c !== '' && c === termo
    })
    if (exato) return { tipo: 'exato', produto: exato }

    // 2/3/4. Filtro amplo: nome OU código contendo o termo.
    const candidatos = produtos.filter(
        (p) => norm(p.nome).includes(termo) || norm(p.codigo).includes(termo),
    )
    if (candidatos.length === 1) return { tipo: 'unico', produto: candidatos[0] }
    if (candidatos.length === 0) return { tipo: 'nenhum' }
    return { tipo: 'multiplos', quantidade: candidatos.length }
}
