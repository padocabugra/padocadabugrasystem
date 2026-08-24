import DespesasClient from './DespesasClient'

// Rota administrativa: por não estar em NAV_ITEMS, o middleware já a restringe
// ao admin (mesma regra de relatórios/usuários). O RLS da tabela reforça isso
// no banco — a página contém salários.
export default function DespesasPage() {
    return <DespesasClient />
}
