'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, UserPlus, Star, Cake } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCPF, formatWhatsApp } from '@/lib/formatters'
import ModalCadastroRapido from '@/components/clientes/ModalCadastroRapido'

interface Cliente {
    id: string
    cpf: string | null
    nome: string
    whatsapp: string | null
    instagram: string | null
    pontos_fidelidade: number
    data_nascimento: string | null
    created_at: string
}

import { TIMEZONE } from '@/lib/timezone'
import { toZonedTime } from 'date-fns-tz'

/** Verifica se a data de nascimento é hoje, obedecendo o Fuso MS */
function isAniversariante(dataNascimento: string | null): boolean {
    if (!dataNascimento) return false
    const hojeZoned = toZonedTime(new Date(), TIMEZONE)
    
    // extrai M e D diretamente da string 'YYYY-MM-DD'
    const [, month, day] = dataNascimento.split('-').map(Number)
    
    return (
        month === (hojeZoned.getMonth() + 1) &&
        day === hojeZoned.getDate()
    )
}

/** Verifica se o aniversário é nos próximos N dias, no Fuso MS */
function aniversarioEmBreve(dataNascimento: string | null, dias = 7): boolean {
    if (!dataNascimento) return false
    const hojeZoned = toZonedTime(new Date(), TIMEZONE)
    
    const [, m, d] = dataNascimento.split('-').map(Number)
    
    const proxAniv = new Date(hojeZoned.getFullYear(), m - 1, d)
    // zera horas pra comparação exata
    hojeZoned.setHours(0,0,0,0)
    
    if (proxAniv < hojeZoned) proxAniv.setFullYear(hojeZoned.getFullYear() + 1)
    
    const diff = (proxAniv.getTime() - hojeZoned.getTime()) / (1000 * 60 * 60 * 24)
    return diff > 0 && diff <= dias
}

export default function ClientesPage() {
    const [clientes, setClientes] = useState<Cliente[]>([])
    const [search, setSearch] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)

    const debouncedSearch = useDebounce(search, 400)

    const fetchClientes = useCallback(async () => {
        setIsLoading(true)
        const supabase = createClient()

        let query = supabase
            .from('clientes')
            .select('id, cpf, nome, whatsapp, instagram, pontos_fidelidade, data_nascimento, created_at')
            .order('nome', { ascending: true })
            .limit(100)

        if (debouncedSearch.trim()) {
            const term = debouncedSearch.trim()
            const digits = term.replace(/\D/g, '')
            if (digits.length > 0 && /^\d+$/.test(term.replace(/[\.\-\s]/g, ''))) {
                query = query.ilike('cpf', `%${digits}%`)
            } else {
                query = query.ilike('nome', `%${term}%`)
            }
        }

        const { data } = await query
        setClientes(data ?? [])
        setIsLoading(false)
    }, [debouncedSearch])

    useEffect(() => {
        fetchClientes()
    }, [fetchClientes])

    function handleClienteCriado() {
        setModalOpen(false)
        fetchClientes()
    }

    // Aniversariantes de hoje e dos próximos 7 dias
    const aniversariantesHoje = clientes.filter((c) => isAniversariante(c.data_nascimento))
    const aniversariantesBreve = clientes.filter(
        (c) => !isAniversariante(c.data_nascimento) && aniversarioEmBreve(c.data_nascimento, 7)
    )

    return (
        <div className="space-y-6">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
                    <p className="text-gray-500 text-sm mt-0.5">
                        {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} encontrado{clientes.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => setModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90
            text-white text-sm font-semibold rounded-lg transition-colors"
                >
                    <UserPlus className="w-4 h-4" />
                    Novo Cliente
                </button>
            </div>

            {/* Banner: Aniversariantes de HOJE */}
            {aniversariantesHoje.length > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <span className="text-2xl">🎂</span>
                    <div>
                        <p className="font-semibold text-blue-800 text-sm">
                            {aniversariantesHoje.length === 1
                                ? 'Aniversariante hoje!'
                                : `${aniversariantesHoje.length} aniversariantes hoje!`}
                        </p>
                        <p className="text-blue-700 text-sm mt-0.5">
                            {aniversariantesHoje.map((c) => c.nome).join(', ')}
                        </p>
                    </div>
                </div>
            )}

            {/* Banner: Aniversários nos próximos 7 dias */}
            {aniversariantesBreve.length > 0 && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <Cake className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-semibold text-blue-800 text-sm">Aniversários nos próximos 7 dias</p>
                        <p className="text-blue-700 text-sm mt-0.5">
                            {aniversariantesBreve.map((c) => c.nome).join(', ')}
                        </p>
                    </div>
                </div>
            )}

            {/* Busca */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    placeholder="Buscar por nome ou CPF..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm
            focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100
            bg-white transition-colors"
                />
            </div>

            {/* Tabela */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                                <th className="text-left px-4 py-3 font-semibold text-gray-600">Nome</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600">CPF</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600">WhatsApp</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600">Instagram</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600">Nascimento</th>
                                <th className="text-left px-4 py-3 font-semibold text-gray-600">
                                    <span className="flex items-center gap-1">
                                        <Star className="w-3.5 h-3.5 text-primary" />
                                        Pontos
                                    </span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                            Carregando...
                                        </div>
                                    </td>
                                </tr>
                            ) : clientes.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                                        {search ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado ainda.'}
                                    </td>
                                </tr>
                            ) : (
                                clientes.map((cliente) => {
                                    const hoje = isAniversariante(cliente.data_nascimento)
                                    const breve = !hoje && aniversarioEmBreve(cliente.data_nascimento, 7)
                                    return (
                                        <tr
                                            key={cliente.id}
                                            className={`border-b border-gray-50 transition-colors ${hoje ? 'bg-blue-50/60' : 'hover:bg-gray-50/60'
                                                }`}
                                        >
                                            <td className="px-4 py-3 font-medium text-gray-800">
                                                <span className="flex items-center gap-2">
                                                    {cliente.nome}
                                                    {hoje && <span title="Aniversário hoje!">🎂</span>}
                                                    {breve && <Cake className="w-3.5 h-3.5 text-blue-400" aria-label="Aniversário em breve" />}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                                                {cliente.cpf ? formatCPF(cliente.cpf) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600">
                                                {cliente.whatsapp ? formatWhatsApp(cliente.whatsapp) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 text-xs">
                                                {cliente.instagram ? (
                                                    <a
                                                        href={`https://instagram.com/${cliente.instagram}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:underline font-medium"
                                                    >
                                                        @{cliente.instagram}
                                                    </a>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 text-xs">
                                                {cliente.data_nascimento
                                                    ? cliente.data_nascimento.split('-').reverse().join('/')
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                                                          bg-blue-50 text-blue-700 text-xs font-semibold">
                                                    <Star className="w-3 h-3" />
                                                    {cliente.pontos_fidelidade}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            <ModalCadastroRapido
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleClienteCriado}
            />
        </div>
    )
}
