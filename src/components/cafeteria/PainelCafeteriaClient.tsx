'use client'

// Painel da Cafeteria — mesmo fluxo do Kanban da Cozinha (pendente → preparando
// → pronto → retirada), porém com fila própria (destino_cafeteria), tema quente
// (âmbar/laranja + café) e o quick-add de 1 item por comanda/mesa/pessoa.

import PainelProducaoKanban, {
    type PedidoProducao,
    type ProdutoQuickAdd,
} from '@/components/producao/PainelProducaoKanban'

interface PainelCafeteriaClientProps {
    pedidosIniciais: PedidoProducao[]
    vendedorId: string
    produtos: ProdutoQuickAdd[]
}

export default function PainelCafeteriaClient({ pedidosIniciais, vendedorId, produtos }: PainelCafeteriaClientProps) {
    return (
        <PainelProducaoKanban
            pedidosIniciais={pedidosIniciais}
            variante="cafeteria"
            quickAdd={{ vendedorId, produtos }}
        />
    )
}
