'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    UserCog, Plus, X, Loader2, Save, Search,
    Shield, ShoppingCart, ChefHat, ShoppingBag,
    ToggleLeft, ToggleRight, Mail, User, KeyRound,
} from 'lucide-react'
import type { UserRole } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsuarioRow {
    id: string
    email: string
    nome: string
    role: UserRole
    ativo: boolean
    created_at: string
}

const ROLE_OPTIONS: { value: UserRole; label: string; icon: React.ElementType; color: string }[] = [
    { value: 'admin', label: 'Administrador', icon: Shield, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { value: 'caixa', label: 'Caixa', icon: ShoppingCart, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { value: 'vendedor', label: 'Vendedor', icon: ShoppingBag, color: 'text-sky-600 bg-sky-50 border-sky-200' },
    { value: 'cozinha', label: 'Cozinha', icon: ChefHat, color: 'text-red-600 bg-red-50 border-red-200' },
]

function getRoleBadge(role: UserRole) {
    const opt = ROLE_OPTIONS.find((r) => r.value === role)
    if (!opt) return null
    const Icon = opt.icon
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${opt.color}`}>
            <Icon className="w-3 h-3" />
            {opt.label}
        </span>
    )
}

// ── Modal Adicionar Usuário ───────────────────────────────────────────────────

function ModalAdicionarUsuario({
    onClose,
    onSuccess,
}: {
    onClose: () => void
    onSuccess: () => void
}) {
    const [nome, setNome] = useState('')
    const [email, setEmail] = useState('')
    const [senha, setSenha] = useState('')
    const [role, setRole] = useState<UserRole>('vendedor')
    const [saving, setSaving] = useState(false)
    const supabase = createClient()

    async function handleCriar() {
        if (!nome.trim()) { toast.error('Informe o nome do funcionário'); return }
        if (!email.trim()) { toast.error('Informe o email'); return }
        if (senha.length < 6) { toast.error('A senha deve ter pelo menos 6 caracteres'); return }

        setSaving(true)
        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email.trim(),
                password: senha,
                options: {
                    data: { nome: nome.trim(), role },
                },
            })

            if (authError) throw authError
            if (!authData.user) throw new Error('Falha ao criar usuário na autenticação')

            const { error: dbError } = await supabase
                .from('usuarios')
                .insert({
                    id: authData.user.id,
                    email: email.trim(),
                    nome: nome.trim(),
                    role,
                    ativo: true,
                })

            if (dbError) throw dbError

            toast.success(`Funcionário "${nome.trim()}" criado com sucesso!`)
            onSuccess()
            onClose()
        } catch (err: any) {
            const msg = err.message?.includes('already registered')
                ? 'Este email já está cadastrado'
                : err.message || 'Erro ao criar funcionário'
            toast.error(msg)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-blue-600" />
                        Novo Funcionário
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Nome Completo</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input type="text" placeholder="Ex: João da Silva" value={nome} onChange={(e) => setNome(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 outline-none" autoFocus />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input type="email" placeholder="funcionario@padoca.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Senha Inicial</label>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={(e) => setSenha(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Cargo / Função</label>
                        <div className="grid grid-cols-2 gap-2">
                            {ROLE_OPTIONS.map((opt) => {
                                const Icon = opt.icon; const isSelected = role === opt.value
                                return (
                                    <button key={opt.value} type="button" onClick={() => setRole(opt.value)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${isSelected ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                                        <Icon className="w-4 h-4" /> {opt.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
                    <button onClick={onClose} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-semibold transition-colors">Cancelar</button>
                    <button onClick={handleCriar} disabled={saving} className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-60">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {saving ? 'Criando...' : 'Criar Funcionário'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Componente Principal ─────────────────────────────────────────────────────

export default function UsuariosClient() {
    const [usuarios, setUsuarios] = useState<UsuarioRow[]>([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [busca, setBusca] = useState('')
    const supabase = createClient()

    const fetchUsuarios = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase.from('usuarios').select('id, email, nome, role, ativo, created_at').order('nome')
        if (error) toast.error('Erro ao carregar usuários')
        else setUsuarios(data ?? [])
        setLoading(false)
    }, [supabase])

    useEffect(() => { fetchUsuarios() }, [fetchUsuarios])

    async function toggleAtivo(id: string, ativoAtual: boolean) {
        const { error } = await supabase.from('usuarios').update({ ativo: !ativoAtual, updated_at: new Date().toISOString() }).eq('id', id)
        if (error) toast.error('Erro ao atualizar status')
        else {
            toast.success(ativoAtual ? 'Usuário desativado' : 'Usuário ativado')
            setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, ativo: !ativoAtual } : u)))
        }
    }

    const filtrados = usuarios.filter((u) => {
        const termo = busca.toLowerCase()
        return u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo) || u.role.toLowerCase().includes(termo)
    })

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
                        <UserCog className="w-5 h-5 text-blue-600" /> Gestão de Usuários
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Gerencie os funcionários e seus níveis de acesso.</p>
                </div>
                <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm active:scale-[0.98]">
                    <Plus className="w-4 h-4" /> Novo Funcionário
                </button>
            </div>
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Buscar por nome, email ou cargo..." value={busca} onChange={(e) => setBusca(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 outline-none bg-white" />
            </div>
            {loading ? (
                <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : filtrados.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-gray-400 gap-4"><UserCog className="w-12 h-12 opacity-20" /><p className="font-medium">Nenhum usuário encontrado</p></div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50/80 border-b border-gray-100">
                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Nome</th>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Email</th>
                                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Cargo</th>
                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="px-5 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wide">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtrados.map((u) => (
                                    <tr key={u.id} className={`hover:bg-gray-50/50 transition-colors ${!u.ativo ? 'opacity-50' : ''}`}>
                                        <td className="px-5 py-3.5"><p className="font-semibold text-gray-800">{u.nome}</p></td>
                                        <td className="px-5 py-3.5 text-gray-500">{u.email}</td>
                                        <td className="px-5 py-3.5">{getRoleBadge(u.role)}</td>
                                        <td className="px-5 py-3.5 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${u.ativo ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${u.ativo ? 'bg-emerald-500' : 'bg-gray-400'}`} /> {u.ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-center">
                                            <button onClick={() => toggleAtivo(u.id, u.ativo)} className={`p-2 rounded-lg transition-colors ${u.ativo ? 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                                                {u.ativo ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {modalOpen && <ModalAdicionarUsuario onClose={() => setModalOpen(false)} onSuccess={fetchUsuarios} />}
        </div>
    )
}
