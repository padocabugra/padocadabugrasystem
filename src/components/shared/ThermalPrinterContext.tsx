'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { toast } from 'sonner'
import {
    obterImpressoraPareada,
    pedirImpressora,
    imprimirNFCe,
    webUsbDisponivel,
    type DadosImpressaoNFCe,
} from '@/lib/thermal-printer'

interface PrinterCtx {
    /** Browser suporta WebUSB (Chrome/Edge sobre HTTPS). */
    suportado: boolean
    /** Existe device pareado e pronto pra imprimir. */
    conectada: boolean
    /** Pede ao usuario pra selecionar a impressora (popup nativo). */
    parear: () => Promise<void>
    /** Imprime um DANFE. Falha silenciosa com toast (nao quebra venda). */
    imprimir: (dados: DadosImpressaoNFCe) => Promise<boolean>
}

const PrinterContext = createContext<PrinterCtx | null>(null)

export function ThermalPrinterProvider({ children }: { children: ReactNode }) {
    const [device, setDevice] = useState<USBDevice | null>(null)
    const [suportado, setSuportado] = useState(false)

    // Detecta se WebUSB ta disponivel e se ja tem device autorizado
    useEffect(() => {
        if (!webUsbDisponivel()) {
            setSuportado(false)
            return
        }
        setSuportado(true)
        obterImpressoraPareada().then((d) => {
            if (d) setDevice(d)
        })

        // Lida com plug/unplug — se a impressora for desconectada, limpa o state
        const onDisconnect = (e: USBConnectionEvent) => {
            if (device && e.device === device) setDevice(null)
        }
        const onConnect = () => {
            obterImpressoraPareada().then((d) => { if (d) setDevice(d) })
        }
        navigator.usb.addEventListener('disconnect', onDisconnect)
        navigator.usb.addEventListener('connect', onConnect)
        return () => {
            navigator.usb.removeEventListener('disconnect', onDisconnect)
            navigator.usb.removeEventListener('connect', onConnect)
        }
    }, [device])

    const parear = useCallback(async () => {
        try {
            const d = await pedirImpressora()
            if (d) {
                setDevice(d)
                toast.success('Impressora conectada!', {
                    description: 'A partir de agora, os cupons saem automaticamente.',
                })
            }
        } catch (err: any) {
            toast.error('Nao foi possivel conectar impressora', { description: err?.message })
        }
    }, [])

    const imprimir = useCallback(async (dados: DadosImpressaoNFCe): Promise<boolean> => {
        if (!device) {
            toast.warning('Impressora nao configurada', {
                description: 'Cupom emitido mas nao impresso. Configure a impressora nas configuracoes.',
            })
            return false
        }
        try {
            await imprimirNFCe(device, dados)
            return true
        } catch (err: any) {
            toast.error('Falha na impressao', {
                description: err?.message ?? 'Verifique papel, conexao USB e tente novamente.',
            })
            return false
        }
    }, [device])

    return (
        <PrinterContext.Provider value={{ suportado, conectada: !!device, parear, imprimir }}>
            {children}
        </PrinterContext.Provider>
    )
}

export function useThermalPrinter(): PrinterCtx {
    const ctx = useContext(PrinterContext)
    if (!ctx) {
        // Provider nao montado — devolve no-op pra nao quebrar SSR/preview
        return {
            suportado: false,
            conectada: false,
            parear: async () => {},
            imprimir: async () => false,
        }
    }
    return ctx
}
