'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[PADOCA_CRM][DASHBOARD] Erro:', {
            message: error.message,
            digest: error.digest,
            timestamp: new Date().toISOString(),
        })
    }, [error])

    return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-sm w-full text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
                    <AlertTriangle className="w-7 h-7 text-amber-500" />
                </div>

                <div>
                    <h2 className="text-lg font-bold text-gray-900">Erro no Painel</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Não foi possível carregar esta seção. Tente novamente.
                    </p>
                </div>

                {error.digest && (
                    <p className="text-xs text-gray-400 font-mono bg-gray-50 rounded-lg px-3 py-1.5">
                        Ref: {error.digest}
                    </p>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={reset}
                        className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition-all active:scale-95"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Tentar Novamente
                    </button>
                    <Link
                        href="/dashboard"
                        className="flex items-center justify-center gap-1.5 px-4 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold text-sm transition-all active:scale-95"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Voltar
                    </Link>
                </div>
            </div>
        </div>
    )
}
