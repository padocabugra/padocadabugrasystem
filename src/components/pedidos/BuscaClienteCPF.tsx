'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, UserCheck, UserX, User } from 'lucide-react'

interface ClienteEncontrado {
    id: string
    nome: string
    cpf: string
    whatsapp: string | null
    pontos_fidelidade: number
}

interface BuscaClienteCPFProps {
    onClienteSelect: (cliente: ClienteEncontrado | null) => void
    clienteSelecionado: ClienteEncontrado | null
}

// Máscara de CPF: 000.000.000-00
function maskCPF(value: string): string {
    return value
        .replace(/\D/g, '')
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export default function BuscaClienteCPF({ onClienteSelect, clienteSelecionado }: BuscaClienteCPFProps) {
    const [cpf, setCpf] = useState('')
    const [buscando, setBuscando] = useState(false)
    const [erro, setErro] = useState<string | null>(null)

    async function handleBuscar() {
        const cpfLimpo = cpf.replace(/\D/g, '')
        if (cpfLimpo.length !== 11) {
            setErro('CPF deve ter 11 dígitos.')
            return
        }

        setBuscando(true)
        setErro(null)
        onClienteSelect(null)

        const supabase = createClient()
        const { data, error } = await supabase
            .from('clientes')
            .select('id, nome, cpf, whatsapp, pontos_fidelidade')
            .eq('cpf', cpfLimpo)
            .single()

        setBuscando(false)

        if (error || !data) {
            setErro('Cliente não encontrado. Tente buscar por outro CPF ou use Cliente Padrão.')
        } else {
            onClienteSelect(data)
        }
    }

    function handleClientePadrao() {
        setCpf('')
        setErro(null)
        onClienteSelect(null)
    }

    return (
        <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">1. Identificar Cliente</p>

            {/* Input + Botão Buscar */}
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(maskCPF(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
                    className="flex-1 h-12 px-4 rounded-xl border border-blue-100 bg-white text-gray-800
                               placeholder:text-gray-400 text-base focus:outline-none focus:ring-2
                               focus:ring-primary/40 font-mono tracking-widest"
                    inputMode="numeric"
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

            {/* Cliente encontrado */}
            {clienteSelecionado && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
                    <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                        <UserCheck className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-green-800 truncate">{clienteSelecionado.nome}</p>
                        <p className="text-xs text-green-600">
                            ⭐ {clienteSelecionado.pontos_fidelidade} pontos · {clienteSelecionado.whatsapp ?? 'Sem WhatsApp'}
                        </p>
                    </div>
                    <button
                        onClick={handleClientePadrao}
                        className="text-xs text-green-600 font-medium hover:text-green-800 transition-colors touch-manipulation p-2"
                    >
                        Trocar
                    </button>
                </div>
            )}

            {/* Cliente Padrão / Balcão */}
            {!clienteSelecionado && (
                <button
                    onClick={handleClientePadrao}
                    className="w-full h-12 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50
                               flex items-center justify-center gap-2 text-sm font-medium text-blue-600
                               active:scale-95 transition-all touch-manipulation"
                >
                    <User className="w-4 h-4" />
                    Cliente Padrão / Balcão (sem identificação)
                </button>
            )}
        </div>
    )
}
