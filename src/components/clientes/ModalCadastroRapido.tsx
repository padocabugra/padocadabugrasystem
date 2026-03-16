'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, UserPlus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
    formatCPF,
    unformatCPF,
    isValidCPF,
    formatWhatsApp,
    unformatWhatsApp,
} from '@/lib/formatters'

// =============================================
// Schema de validação
// =============================================
const schema = z.object({
    nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
    cpf: z
        .string()
        .optional()
        .refine((v) => !v || isValidCPF(v), { message: 'CPF inválido' }),
    whatsapp: z
        .string()
        .optional()
        .refine((v) => !v || unformatWhatsApp(v).length >= 10, {
            message: 'WhatsApp inválido',
        }),
    instagram: z.string().optional(),
    data_nascimento: z
        .string()
        .optional()
        .refine((v) => !v || !isNaN(Date.parse(v)), { message: 'Data inválida' }),
})

type FormData = z.infer<typeof schema>

// =============================================
// Props — projetado para ser invocado de qualquer tela
// =============================================
interface ModalCadastroRapidoProps {
    open: boolean
    onClose: () => void
    /** Retorna o ID do cliente criado — útil para tela de Pedidos */
    onSuccess: (clienteId: string) => void
    /** CPF pré-preenchido (ex: vindo da tela de Pedidos) */
    cpfInicial?: string
}

export default function ModalCadastroRapido({
    open,
    onClose,
    onSuccess,
    cpfInicial,
}: ModalCadastroRapidoProps) {
    const [serverError, setServerError] = useState<string | null>(null)
    // Ref separado para foco — não conflita com register()
    const nomeRef = useRef<HTMLInputElement>(null)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { nome: '', cpf: '', whatsapp: '', instagram: '', data_nascimento: '' },
    })

    const cpfValue = watch('cpf') ?? ''
    const whatsappValue = watch('whatsapp') ?? ''

    // Foca no campo nome ao abrir
    useEffect(() => {
        if (open) {
            reset()
            setServerError(null)
            if (cpfInicial) setValue('cpf', formatCPF(cpfInicial))
            setTimeout(() => nomeRef.current?.focus(), 100)
        }
    }, [open, cpfInicial, reset, setValue])

    // Fecha com Escape
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose()
        }
        if (open) window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    async function onSubmit(data: FormData) {
        setServerError(null)
        const supabase = createClient()

        const cpfDigits = data.cpf ? unformatCPF(data.cpf) : null
        const whatsappDigits = data.whatsapp ? unformatWhatsApp(data.whatsapp) : null

        // Verifica CPF duplicado
        if (cpfDigits) {
            const { data: existing } = await supabase
                .from('clientes')
                .select('id')
                .eq('cpf', cpfDigits)
                .maybeSingle()

            if (existing) {
                setServerError('Já existe um cliente cadastrado com esse CPF.')
                return
            }
        }

        const { data: inserted, error } = await supabase
            .from('clientes')
            .insert({
                nome: data.nome.trim(),
                cpf: cpfDigits,
                whatsapp: whatsappDigits,
                instagram: data.instagram?.trim().replace(/^@/, '') || null,
                data_nascimento: data.data_nascimento || null,
            })
            .select('id')
            .single()

        if (error || !inserted) {
            setServerError('Erro ao cadastrar cliente. Tente novamente.')
            return
        }

        onSuccess(inserted.id)
        reset()
    }

    if (!open) return null

    // Extrai o register do nome para poder combinar com a ref manual
    const { ref: nomeRegisterRef, ...nomeRegisterRest } = register('nome')

    return (
        // Overlay
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            {/* Modal */}
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                            <UserPlus className="w-4 h-4 text-blue-600" />
                        </div>
                        <h2 className="font-semibold text-gray-800">Cadastro Rápido</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Formulário */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                    {/* Nome */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">
                            Nome <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="Nome completo"
                            className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-colors
                ${errors.nome
                                    ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                                    : 'border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                                }`}
                            ref={(el) => {
                                nomeRegisterRef(el)
                                nomeRef.current = el
                            }}
                            {...nomeRegisterRest}
                        />
                        {errors.nome && (
                            <p className="text-xs text-red-500">{errors.nome.message}</p>
                        )}
                    </div>

                    {/* CPF */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">CPF</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="000.000.000-00"
                            value={cpfValue}
                            className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-colors font-mono
                ${errors.cpf
                                    ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                                    : 'border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                                }`}
                            onChange={(e) => setValue('cpf', formatCPF(e.target.value), { shouldValidate: true })}
                        />
                        {errors.cpf && (
                            <p className="text-xs text-red-500">{errors.cpf.message}</p>
                        )}
                    </div>

                    {/* WhatsApp */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">WhatsApp</label>
                        <input
                            type="text"
                            inputMode="tel"
                            placeholder="(00) 00000-0000"
                            value={whatsappValue}
                            className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-colors
                ${errors.whatsapp
                                    ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                                    : 'border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                                }`}
                            onChange={(e) =>
                                setValue('whatsapp', formatWhatsApp(e.target.value), { shouldValidate: true })
                            }
                        />
                        {errors.whatsapp && (
                            <p className="text-xs text-red-500">{errors.whatsapp.message}</p>
                        )}
                    </div>

                    {/* Instagram */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">Instagram</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                            <input
                                type="text"
                                placeholder="usuario"
                                className="w-full pl-8 pr-3.5 py-2.5 rounded-lg border text-sm outline-none transition-colors
                                           border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                {...register('instagram')}
                            />
                        </div>
                    </div>

                    {/* Data de Nascimento */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">
                            Data de Nascimento
                            <span className="ml-1.5 text-xs font-normal text-blue-600">🎂 para alertas de aniversário</span>
                        </label>
                        <input
                            type="date"
                            max={new Date().toISOString().split('T')[0]}
                            className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-colors
                ${errors.data_nascimento
                                    ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                                    : 'border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
                                }`}
                            {...register('data_nascimento')}
                        />
                        {errors.data_nascimento && (
                            <p className="text-xs text-red-500">{errors.data_nascimento.message}</p>
                        )}
                    </div>

                    {/* Erro do servidor */}
                    {serverError && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                            <span className="text-red-500 text-sm">⚠</span>
                            <p className="text-sm text-red-600">{serverError}</p>
                        </div>
                    )}

                    {/* Ações */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium
                rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300
                text-white text-sm font-semibold rounded-lg transition-colors
                flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                'Cadastrar'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
