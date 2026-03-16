'use client'

import { useState } from 'react'
import {
    FlaskConical, ChevronDown, ChevronUp, Edit2, Trash2,
    ArrowRight, ChefHat, Clock, DollarSign, ShieldAlert,
    Salad, UtensilsCrossed, Package,
} from 'lucide-react'
import type { Produto } from '@/lib/types/produto'
import type { Receita } from '@/lib/types/receita'

interface Props {
    receita: Receita
    produtosMap: Record<string, Produto>
    onEditar: (r: Receita) => void
    onExcluir: (id: string) => void
}

export default function CardFichaTecnica({ receita, produtosMap, onEditar, onExcluir }: Props) {
    const [expandido, setExpandido] = useState(false)
    const [secao, setSecao] = useState<string>('ingredientes')

    const tempoTotal = (receita.tempo_preparacao || 0) + (receita.tempo_coccao || 0) + (receita.tempo_descanso || 0)

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Header compacto */}
            <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50/70 transition-colors"
                onClick={() => setExpandido(v => !v)}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
                        {receita.imagem_url ? (
                            <img src={receita.imagem_url} alt="" className="w-full h-full rounded-xl object-cover" />
                        ) : (
                            <FlaskConical className="w-4.5 h-4.5 text-primary" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="font-bold text-gray-800 text-sm truncate">{receita.nome}</p>
                            {receita.categoria && (
                                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md uppercase shrink-0">
                                    {receita.categoria}
                                </span>
                            )}
                            {receita.codigo_interno && (
                                <span className="text-[10px] font-mono text-gray-400 shrink-0">#{receita.codigo_interno}</span>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span className="flex items-center gap-0.5"><ArrowRight className="w-3 h-3" /> <strong className="text-gray-600">{receita.produto?.nome ?? '—'}</strong></span>
                            <span>· {receita.ingredientes?.length || 0} ingredientes</span>
                            {tempoTotal > 0 && <span>· <Clock className="w-3 h-3 inline" /> {tempoTotal}min</span>}
                            {receita.preco_venda_sugerido > 0 && (
                                <span className="text-emerald-600 font-semibold">· R$ {Number(receita.preco_venda_sugerido).toFixed(2)}</span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                    <button onClick={e => { e.stopPropagation(); onEditar(receita) }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                        <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); onExcluir(receita.id) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="text-gray-300">
                        {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                </div>
            </div>

            {/* Conteúdo expandido */}
            {expandido && (
                <div className="border-t border-gray-100">
                    {/* Sub-abas */}
                    <div className="flex gap-1 px-4 py-2 bg-gray-50/70 overflow-x-auto">
                        {[
                            { id: 'ingredientes', label: 'Ingredientes', icon: Package },
                            { id: 'preparo', label: 'Preparo', icon: Clock },
                            { id: 'apresentacao', label: 'Empratamento', icon: UtensilsCrossed },
                            { id: 'custos', label: 'Custos', icon: DollarSign },
                            { id: 'adicionais', label: 'Info', icon: ShieldAlert },
                            { id: 'nutricao', label: 'Nutrição', icon: Salad },
                        ].map(s => {
                            const Icon = s.icon
                            return (
                                <button key={s.id} onClick={() => setSecao(s.id)}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${secao === s.id ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    <Icon className="w-3 h-3" /> {s.label}
                                </button>
                            )
                        })}
                    </div>

                    <div className="p-5">
                        {/* Ingredientes */}
                        {secao === 'ingredientes' && (
                            <div>
                                <table className="w-full text-xs">
                                    <thead className="text-gray-400 uppercase tracking-wide">
                                        <tr>
                                            <th className="px-2 py-2 text-left font-semibold">Ingrediente</th>
                                            <th className="px-2 py-2 text-right font-semibold">Qtd/lote</th>
                                            <th className="px-2 py-2 text-right font-semibold hidden sm:table-cell">Custo Unit.</th>
                                            <th className="px-2 py-2 text-right font-semibold hidden sm:table-cell">Total</th>
                                            <th className="px-2 py-2 text-right font-semibold hidden md:table-cell">Estoque</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {receita.ingredientes?.map((ing, idx) => {
                                            const prod = produtosMap[ing.produto_id]
                                            const custoTotal = (ing.custo_unitario || 0) * (ing.quantidade || 0)
                                            return (
                                                <tr key={idx}>
                                                    <td className="px-2 py-2.5 font-medium text-gray-700">
                                                        <div>{prod?.nome ?? ing.produto_id}</div>
                                                        {(ing.marca || ing.fornecedor) && (
                                                            <div className="text-[10px] text-gray-400">{[ing.marca, ing.fornecedor].filter(Boolean).join(' · ')}</div>
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right font-bold text-gray-800">
                                                        {ing.quantidade?.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {ing.unidade}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right hidden sm:table-cell text-gray-500">
                                                        {ing.custo_unitario ? `R$ ${Number(ing.custo_unitario).toFixed(2)}` : '—'}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right hidden sm:table-cell font-semibold text-gray-700">
                                                        {custoTotal > 0 ? `R$ ${custoTotal.toFixed(2)}` : '—'}
                                                    </td>
                                                    <td className="px-2 py-2.5 text-right hidden md:table-cell text-gray-500">
                                                        {prod ? `${Number(prod.estoque_atual).toLocaleString('pt-BR')} ${prod.unidade_medida}` : '—'}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                {receita.custo_total_ingredientes > 0 && (
                                    <div className="flex justify-end mt-3 px-2">
                                        <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 text-xs font-bold text-primary">
                                            Total: R$ {Number(receita.custo_total_ingredientes).toFixed(2)}
                                        </div>
                                    </div>
                                )}
                                {receita.comentarios_ingredientes && (
                                    <p className="text-xs text-gray-500 mt-3 italic px-2">{receita.comentarios_ingredientes}</p>
                                )}
                            </div>
                        )}

                        {/* Preparo */}
                        {secao === 'preparo' && (
                            <div className="space-y-4">
                                {tempoTotal > 0 && (
                                    <div className="flex gap-3">
                                        {receita.tempo_preparacao > 0 && <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs"><span className="text-blue-500 font-semibold">Prep:</span> <strong className="text-blue-700">{receita.tempo_preparacao}min</strong></div>}
                                        {receita.tempo_coccao > 0 && <div className="bg-primary/5 rounded-lg px-3 py-2 text-xs"><span className="text-primary font-semibold">Cocção:</span> <strong className="text-primary font-bold">{receita.tempo_coccao}min</strong></div>}
                                        {receita.tempo_descanso > 0 && <div className="bg-green-50 rounded-lg px-3 py-2 text-xs"><span className="text-green-500 font-semibold">Descanso:</span> <strong className="text-green-700">{receita.tempo_descanso}min</strong></div>}
                                    </div>
                                )}
                                {receita.instrucoes_preparo?.length > 0 ? (
                                    <ol className="space-y-2">
                                        {receita.instrucoes_preparo.map((inst, idx) => (
                                            <li key={idx} className="flex items-start gap-2.5">
                                                <div className="w-6 h-6 bg-primary/10 text-primary rounded-md flex items-center justify-center text-[11px] font-extrabold shrink-0 mt-0.5">{inst.ordem || idx + 1}</div>
                                                <p className="text-sm text-gray-700 leading-relaxed">{inst.descricao}</p>
                                            </li>
                                        ))}
                                    </ol>
                                ) : <p className="text-xs text-gray-400 italic">Nenhuma instrução cadastrada</p>}
                            </div>
                        )}

                        {/* Apresentação */}
                        {secao === 'apresentacao' && (
                            <div className="space-y-3 text-sm">
                                {receita.prato_recipiente && <div><span className="text-xs font-bold text-gray-500 uppercase">Recipiente:</span><p className="text-gray-700">{receita.prato_recipiente}</p></div>}
                                {receita.posicionamento_itens && <div><span className="text-xs font-bold text-gray-500 uppercase">Posicionamento:</span><p className="text-gray-700">{receita.posicionamento_itens}</p></div>}
                                {receita.guarnicoes_decoracao && <div><span className="text-xs font-bold text-gray-500 uppercase">Guarnições:</span><p className="text-gray-700">{receita.guarnicoes_decoracao}</p></div>}
                                {receita.sugestao_acompanhamento && <div><span className="text-xs font-bold text-gray-500 uppercase">Acompanhamento:</span><p className="text-gray-700">{receita.sugestao_acompanhamento}</p></div>}
                                {receita.imagem_empratamento_url && <img src={receita.imagem_empratamento_url} alt="Empratamento" className="mt-3 rounded-xl max-h-48 object-cover border border-gray-200" />}
                                {!receita.prato_recipiente && !receita.posicionamento_itens && !receita.guarnicoes_decoracao && !receita.sugestao_acompanhamento && (
                                    <p className="text-xs text-gray-400 italic">Nenhuma informação de empratamento cadastrada</p>
                                )}
                            </div>
                        )}

                        {/* Custos */}
                        {secao === 'custos' && (
                            <div className="space-y-2">
                                {[
                                    ['Custo ingredientes / porção', receita.custo_por_porcao],
                                    ['Despesa operacional', receita.despesa_operacional],
                                    ['Custo total / porção', receita.custo_total_porcao],
                                    ['Margem de lucro', receita.margem_lucro, '%'],
                                    ['Preço de venda sugerido', receita.preco_venda_sugerido],
                                ].map(([label, value, suffix], idx) => (
                                    <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                        <span className="text-xs font-medium text-gray-600">{label as string}</span>
                                        <span className={`text-sm font-bold ${idx === 4 ? 'text-emerald-700' : 'text-gray-800'}`}>
                                            {Number(value) > 0 ? `${suffix === '%' ? '' : 'R$ '}${Number(value).toFixed(2)}${suffix === '%' ? '%' : ''}` : '—'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Adicionais */}
                        {secao === 'adicionais' && (
                            <div className="space-y-4">
                                <div>
                                    <span className="text-xs font-bold text-gray-500 uppercase">Alérgenos</span>
                                    <div className="flex gap-2 mt-1.5 flex-wrap">
                                        {receita.alergenos?.gluten && <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-lg">Glúten</span>}
                                        {receita.alergenos?.lactose && <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-lg">Lactose</span>}
                                        {receita.alergenos?.nuts && <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded-lg">Nuts</span>}
                                        {!receita.alergenos?.gluten && !receita.alergenos?.lactose && !receita.alergenos?.nuts && (
                                            <span className="text-xs text-gray-400 italic">Nenhum alérgeno marcado</span>
                                        )}
                                    </div>
                                </div>
                                {receita.observacoes_especiais && (
                                    <div>
                                        <span className="text-xs font-bold text-gray-500 uppercase">Observações</span>
                                        <p className="text-sm text-gray-700 mt-1">{receita.observacoes_especiais}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Nutrição */}
                        {secao === 'nutricao' && (
                            <div>
                                {receita.nutricao && Object.values(receita.nutricao).some(v => v > 0) ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                        {[
                                            ['Calorias', receita.nutricao.calorias, 'kcal'],
                                            ['Proteínas', receita.nutricao.proteinas, 'g'],
                                            ['Carboidratos', receita.nutricao.carboidratos, 'g'],
                                            ['Gorduras', receita.nutricao.gorduras, 'g'],
                                            ['Fibras', receita.nutricao.fibras, 'g'],
                                        ].map(([label, value, unit], idx) => (
                                            <div key={idx} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                                <p className="text-[10px] text-gray-500 font-semibold uppercase">{label as string}</p>
                                                <p className="text-lg font-extrabold text-gray-800">{Number(value || 0).toFixed(1)}</p>
                                                <p className="text-[10px] text-gray-400">{unit as string}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-xs text-gray-400 italic">Nenhuma informação nutricional cadastrada</p>}
                            </div>
                        )}
                    </div>

                    {/* Link para produção */}
                    <div className="px-5 py-3 border-t border-gray-100 flex justify-end bg-gray-50/50">
                        <a href="/dashboard/producao" className="text-xs text-primary font-bold hover:underline flex items-center gap-1">
                            <ChefHat className="w-3 h-3" /> Registrar Produção
                        </a>
                    </div>
                </div>
            )}
        </div>
    )
}
