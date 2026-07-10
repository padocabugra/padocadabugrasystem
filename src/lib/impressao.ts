/**
 * Opções de impressão de papel ao finalizar uma venda.
 *
 * IMPORTANTE: a NFC-e é SEMPRE emitida/declarada à SEFAZ (o payload sai
 * independentemente da opção). Isto controla APENAS quais PAPÉIS saem na
 * impressora térmica:
 *
 *   • Nota de Pedido  → comprovante NÃO-fiscal (itens, mesa/comanda, destino)
 *   • Cupom fiscal    → DANFE da NFC-e (chave de acesso + QR-Code da SEFAZ)
 *
 * As duas impressões são independentes. A escolha do operador (por venda) é a
 * fonte da verdade sobre o papel — nada aqui interfere na emissão fiscal.
 */
export type OpcaoImpressao = 'ambos' | 'pedido' | 'nota' | 'nenhum'

/**
 * Flag de ambiente que define o PADRÃO da seleção (o "padrão da casa").
 *
 * Com 1 impressora só, o dono pode preferir pausar o cupom fiscal por padrão e
 * imprimir a Nota de Pedido no lugar — mas o operador continua podendo escolher
 * manualmente por venda. Ausente ou diferente de 'false' => padrão inclui a
 * nota fiscal (comportamento legado de "Emitir e Imprimir").
 */
export const IMPRIMIR_NFCE_PADRAO = process.env.NEXT_PUBLIC_IMPRIMIR_NFCE !== 'false'

/**
 * Opção pré-selecionada ao abrir a finalização, derivada da flag da casa:
 *  • cupom fiscal ligado  → 'ambos'  (Nota de Pedido + cupom fiscal)
 *  • cupom fiscal pausado → 'pedido' (só a Nota de Pedido)
 */
export function opcaoImpressaoPadrao(): OpcaoImpressao {
    return IMPRIMIR_NFCE_PADRAO ? 'ambos' : 'pedido'
}

/**
 * Traduz a opção escolhida nos dois papéis independentes.
 *  • imprimirPedido → imprime a Nota de Pedido (comprovante não-fiscal)
 *  • imprimirNota   → imprime o DANFE da NFC-e (cupom fiscal)
 */
export function resolverImpressao(opcao: OpcaoImpressao): {
    imprimirPedido: boolean
    imprimirNota: boolean
} {
    return {
        imprimirPedido: opcao === 'ambos' || opcao === 'pedido',
        imprimirNota: opcao === 'ambos' || opcao === 'nota',
    }
}

/**
 * Metadados p/ renderizar o seletor. Sem JSX de propósito — o ícone é escolhido
 * no componente. A ordem aqui é a ordem exibida (2x2: linha 1 imprime papel,
 * linha 2 encerra com "só nota" e "não imprimir").
 */
export const OPCOES_IMPRESSAO: {
    value: OpcaoImpressao
    titulo: string
    subtitulo: string
}[] = [
    { value: 'ambos', titulo: 'Nota + Pedido', subtitulo: 'Cupom fiscal e pedido' },
    { value: 'pedido', titulo: 'Só Pedido', subtitulo: 'Apenas o pedido' },
    { value: 'nota', titulo: 'Só Nota', subtitulo: 'Apenas o cupom fiscal' },
    { value: 'nenhum', titulo: 'Não imprimir', subtitulo: 'Nenhum papel' },
]
