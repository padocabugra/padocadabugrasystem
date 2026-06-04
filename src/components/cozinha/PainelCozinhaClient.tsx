'use client'

// Painel da Cozinha — fino wrapper sobre o Kanban de produção genérico.
// A lógica/realtime/atalhos vivem em PainelProducaoKanban (variante 'cozinha'),
// compartilhada com o painel da Cafeteria. O comportamento e o visual da
// Cozinha permanecem idênticos ao original.

import PainelProducaoKanban, { type PedidoProducao } from '@/components/producao/PainelProducaoKanban'

/** @deprecated Use PedidoProducao. Mantido por compatibilidade. */
export type PedidoCozinha = PedidoProducao

interface PainelCozinhaClientProps {
    pedidosIniciais: PedidoProducao[]
}

export default function PainelCozinhaClient({ pedidosIniciais }: PainelCozinhaClientProps) {
    return <PainelProducaoKanban pedidosIniciais={pedidosIniciais} variante="cozinha" />
}
