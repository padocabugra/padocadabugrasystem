'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Plus, FlaskConical, ChefHat, BookOpen, Package } from 'lucide-react'
import type { Produto } from '@/lib/types/produto'
import type { Receita } from '@/lib/types/receita'
import ModalFichaTecnica from '@/components/producao/ModalFichaTecnica'
import CardFichaTecnica from '@/components/producao/CardFichaTecnica'

const RECEITA_SELECT = `
    id, nome, produto_id, ingredientes, created_at, updated_at,
    categoria, codigo_interno, descricao, rendimento_total, peso_por_porcao, imagem_url,
    custo_total_ingredientes, comentarios_ingredientes,
    tempo_preparacao, tempo_coccao, tempo_descanso, instrucoes_preparo,
    prato_recipiente, posicionamento_itens, guarnicoes_decoracao, sugestao_acompanhamento, imagem_empratamento_url,
    custo_por_porcao, despesa_operacional, custo_total_porcao, margem_lucro, preco_venda_sugerido,
    alergenos, observacoes_especiais, nutricao,
    produto:produtos!produto_id(id, nome, unidade_medida, estoque_atual)
`

export default function ReceitasPage() {
    const [receitas, setReceitas] = useState<Receita[]>([])
    const [produtosProprios, setProdutosProprios] = useState<Produto[]>([])
    const [produtosInsumos, setProdutosInsumos] = useState<Produto[]>([])
    const [produtosMap, setProdutosMap] = useState<Record<string, Produto>>({})
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editando, setEditando] = useState<Receita | null>(null)
    const supabase = createClient()

    const fetchTudo = useCallback(async () => {
        setLoading(true)
        const [recRes, prodRes] = await Promise.all([
            supabase.from('receitas').select(RECEITA_SELECT).order('nome'),
            supabase.from('produtos').select('*').eq('ativo', true).order('nome'),
        ])

        if (recRes.data) setReceitas(recRes.data as any)
        if (prodRes.data) {
            const todos = prodRes.data as Produto[]
            const map: Record<string, Produto> = {}
            for (const p of todos) map[p.id] = p
            setProdutosMap(map)
            setProdutosProprios(todos.filter(p => p.tipo === 'proprio'))
            setProdutosInsumos(todos.filter(p => p.tipo === 'terceirizado'))
        }
        if (recRes.error) toast.error('Erro ao carregar fichas técnicas')
        setLoading(false)
    }, [supabase])

    useEffect(() => { fetchTudo() }, [fetchTudo])

    async function handleExcluir(id: string) {
        if (!confirm('Excluir esta ficha técnica?')) return
        const { error } = await supabase.from('receitas').delete().eq('id', id)
        if (error) toast.error('Erro ao excluir')
        else { toast.success('Ficha técnica excluída'); fetchTudo() }
    }

    function abrirNova() { setEditando(null); setModalOpen(true) }
    function abrirEditar(r: Receita) { setEditando(r); setModalOpen(true) }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-primary" />
                        Fichas Técnicas
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Cadastre receitas completas com ingredientes, custos, preparo e nutrição.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href="/dashboard/producao"
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-colors"
                    >
                        <ChefHat className="w-4 h-4" />
                        Ir para Produção
                    </a>
                    <button
                        onClick={abrirNova}
                        className="btn-primary"
                    >
                        <Plus className="w-4 h-4" />
                        Nova Ficha
                    </button>
                </div>
            </div>

            {/* Aviso se sem insumos */}
            {produtosInsumos.length === 0 && !loading && (
                <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary">
                    <Package className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <strong>Nenhum insumo cadastrado.</strong> Crie produtos com tipo &quot;Terceirizado/Revenda&quot; na página de{' '}
                        <a href="/dashboard/produtos" className="underline font-semibold">Produtos</a> para adicioná-los como ingredientes.
                    </div>
                </div>
            )}

            {/* Lista */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            ) : receitas.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-gray-400 gap-4">
                    <FlaskConical className="w-12 h-12 opacity-20" />
                    <p className="font-medium">Nenhuma ficha técnica cadastrada</p>
                    <button onClick={abrirNova} className="text-sm text-primary font-semibold hover:underline">
                        + Criar primeira ficha técnica
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {receitas.map(r => (
                        <CardFichaTecnica
                            key={r.id}
                            receita={r}
                            produtosMap={produtosMap}
                            onEditar={abrirEditar}
                            onExcluir={handleExcluir}
                        />
                    ))}
                </div>
            )}

            {/* Modal */}
            {modalOpen && (
                <ModalFichaTecnica
                    onClose={() => setModalOpen(false)}
                    onSuccess={fetchTudo}
                    receitaEdit={editando}
                    produtosProprios={produtosProprios}
                    produtosInsumos={produtosInsumos}
                />
            )}
        </div>
    )
}
