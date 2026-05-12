'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log estruturado para diagnóstico — sem expor detalhes ao usuário
        console.error('[PADOCA_CRM] Erro não tratado:', {
            message: error.message,
            digest: error.digest,
            timestamp: new Date().toISOString(),
        })
    }, [error])

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 max-w-md w-full text-center space-y-5">
                <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>

                <div>
                    <h1 className="text-xl font-bold text-gray-900">Algo deu errado</h1>
                    <p className="text-sm text-gray-500 mt-2">
                        Ocorreu um erro inesperado. Tente novamente ou volte à página inicial.
                    </p>
                </div>

                {/* Digest para suporte — sem expor stack trace */}
                {error.digest && (
                    <p className="text-xs text-gray-400 font-mono bg-gray-50 rounded-lg px-3 py-2">
                        Ref: {error.digest}
                    </p>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={reset}
                        className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition-all active:scale-95"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Tentar Novamente
                    </button>
                    <Link
                        href="/dashboard"
                        className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-all active:scale-95"
                    >
                        <Home className="w-4 h-4" />
                        Início
                    </Link>
                </div>
            </div>
        </div>
    )
}
