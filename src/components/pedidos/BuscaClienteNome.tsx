'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, UserCheck, UserX } from 'lucide-react'

interface ClienteEncontrado {
    id: string
    nome: string
    cpf: string
    whatsapp: string | null
    pontos_fidelidade: number
}

interface BuscaClienteNomeProps {
    onClienteSelect: (cliente: ClienteEncontrado | null) => void
    clienteSelecionado: ClienteEncontrado | null
}

// Máscara de CPF só para exibição na lista de resultados: 000.000.000-00
function maskCPF(value: string): string {
    return value
        .replace(/\D/g, '')
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export default function BuscaClienteNome({ onClienteSelect, clienteSelecionado }: BuscaClienteNomeProps) {
    const [nome, setNome] = useState('')
    const [buscando, setBuscando] = useState(false)
    const [erro, setErro] = useState<string | null>(null)
    const [resultados, setResultados] = useState<ClienteEncontrado[]>([])

    async function handleBuscar() {
        const termo = nome.trim()
        if (termo.length < 2) {
            setErro('Digite ao menos 2 letras do nome.')
            return
        }

        setBuscando(true)
        setErro(null)
        setResultados([])
        onClienteSelect(null)

        const supabase = createClient()
        const { data, error } = await supabase
            .from('clientes')
            .select('id, nome, cpf, whatsapp, pontos_fidelidade')
            .ilike('nome', `%${termo}%`)
            .order('nome', { ascending: true })
            .limit(20)

        setBuscando(false)

        if (error || !data || data.length === 0) {
            setErro('Cliente não encontrado. Tente outro nome ou use Cliente Padrão.')
        } else {
            setResultados(data)
        }
    }

    function handleSelecionar(cliente: ClienteEncontrado) {
        setResultados([])
        onClienteSelect(cliente)
    }

    function handleClientePadrao() {
        setNome('')
        setErro(null)
        setResultados([])
        onClienteSelect(null)
    }

    return (
        <div className="space-y-3">
            {/* Input + Botão Buscar */}
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Nome do cliente"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                    className="flex-1 h-12 px-4 rounded-xl border border-blue-100 bg-white text-gray-800
                               placeholder:text-gray-400 text-base focus:outline-none focus:ring-2
                               focus:ring-primary/40"
                />
                <button
                    onClick={handleBuscar}
                    disabled={buscando}
                    className="h-12 px-5 rounded-xl bg-primary text-white font-semibold flex items-center
                               gap-2 active:scale-95 disabled:opacity-50 transition-all touch-manipulation"
                >
                    <Search className="w-4 h-4" />
                    {buscando ? 'Buscando...' : 'Buscar'}
                </button>
            </div>

            {/* Erro */}
            {erro && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-100">
                    <UserX className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-600">{erro}</p>
                </div>
            )}

            {/* Lista de resultados (nome pode ter vários clientes) */}
            {!clienteSelecionado && resultados.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    {resultados.map((c) => (
                        <button
                            key={c.id}
                            onClick={() => handleSelecionar(c)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-blue-100
                                       hover:border-primary hover:bg-blue-50/50 transition-all touch-manipulation text-left"
                        >
                            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                <UserCheck className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-800 truncate">{c.nome}</p>
                                <p className="text-xs text-gray-500">
                                    {c.cpf ? maskCPF(c.cpf) : 'Sem CPF'} · ⭐ {c.pontos_fidelidade} pontos
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Cliente encontrado */}
            {clienteSelecionado && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-teal-50 border border-teal-200">
                    <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center shrink-0">
                        <UserCheck className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-teal-800 truncate">{clienteSelecionado.nome}</p>
                        <p className="text-xs text-teal-700">
                            ⭐ {clienteSelecionado.pontos_fidelidade} pontos · {clienteSelecionado.whatsapp ?? 'Sem WhatsApp'}
                        </p>
                    </div>
                    <button
                        onClick={handleClientePadrao}
                        className="text-xs text-teal-700 font-medium hover:text-teal-900 transition-colors touch-manipulation p-2"
                    >
                        Trocar
                    </button>
                </div>
            )}
        </div>
    )
}
