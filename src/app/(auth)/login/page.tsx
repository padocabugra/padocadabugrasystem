'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Store, AlertCircle } from 'lucide-react'

const loginSchema = z.object({
    email: z.string().email('E-mail inválido'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginPage() {
    const router = useRouter()
    const [serverError, setServerError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
    })

    async function onSubmit(data: LoginFormData) {
        setIsLoading(true)
        setServerError(null)

        const supabase = createClient()
        const { error } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password,
        })

        if (error) {
            setServerError('E-mail ou senha inválidos. Tente novamente.')
            setIsLoading(false)
            return
        }

        router.push('/selecionar-ambiente')
        router.refresh()
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-blue-50/30">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 shadow-lg shadow-blue-900/20 text-white">
                        <Store className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Padoca da Bugra</h1>
                    <p className="text-secondary mt-1 text-sm font-medium">Sistema de Gestão</p>
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-xl shadow-blue-900/5 border border-blue-100 p-8">
                    <h2 className="text-xl font-semibold text-gray-800 mb-6">Entrar na conta</h2>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        {/* E-mail */}
                        <div className="space-y-1.5">
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                                E-mail
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="seu@email.com"
                                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-all
                  ${errors.email
                                        ? 'border-red-400 focus:ring-2 focus:ring-red-200'
                                        : 'border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50'
                                    }`}
                                {...register('email')}
                            />
                            {errors.email && (
                                <p className="text-xs text-red-500">{errors.email.message}</p>
                            )}
                        </div>

                        {/* Senha */}
                        <div className="space-y-1.5">
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                Senha
                            </label>
                            <input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                placeholder="••••••••"
                                className={`w-full px-3.5 py-2.5 rounded-lg border text-sm outline-none transition-all
                  ${errors.password
                                        ? 'border-red-400 focus:ring-2 focus:ring-red-200'
                                        : 'border-gray-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50'
                                    }`}
                                {...register('password')}
                            />
                            {errors.password && (
                                <p className="text-xs text-red-500">{errors.password.message}</p>
                            )}
                        </div>

                        {/* Erro do servidor */}
                        {serverError && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                                <AlertCircle className="w-5 h-5 text-red-500" />
                                <p className="text-sm text-red-600">{serverError}</p>
                            </div>
                        )}

                        {/* Botão */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 disabled:bg-primary/50
                text-white font-semibold rounded-lg text-sm transition-all duration-200 shadow-sm hover:shadow-md
                focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                        >
                            {isLoading ? 'Entrando...' : 'Entrar'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-secondary/60 mt-8 font-medium">
                    Padoca da Bugra © {new Date().getFullYear()}
                </p>
            </div>
        </div>
    )
}
