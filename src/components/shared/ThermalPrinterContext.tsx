'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { toast } from 'sonner'
import {
    obterImpressoraPareada,
    pedirImpressoraUSB,
    pedirImpressoraSerial,
    imprimirNFCe,
    webUsbDisponivel,
    webSerialDisponivel,
    type ImpressoraPareada,
    type DadosImpressaoNFCe,
} from '@/lib/thermal-printer'

interface PrinterCtx {
    /** Browser suporta WebUSB ou WebSerial. */
    suportado: boolean
    /** Existe device pareado e pronto. */
    conectada: boolean
    /** Tipo da conexao atual ("usb" | "serial" | null). */
    tipoConexao: 'usb' | 'serial' | null
    /** Tenta conectar — primeiro USB direto, depois Serial se USB falhar com Access Denied. */
    parear: () => Promise<void>
    /** Força tentar conectar via porta serial (COM). */
    pearSerial: () => Promise<void>
    /** Imprime um DANFE. Toast em caso de erro; nao quebra venda. */
    imprimir: (dados: DadosImpressaoNFCe) => Promise<boolean>
}

const PrinterContext = createContext<PrinterCtx | null>(null)

export function ThermalPrinterProvider({ children }: { children: ReactNode }) {
    const [impressora, setImpressora] = useState<ImpressoraPareada | null>(null)
    const [suportado, setSuportado] = useState(false)

    useEffect(() => {
        const sup = webUsbDisponivel() || webSerialDisponivel()
        setSuportado(sup)
        if (!sup) return

        obterImpressoraPareada().then((p) => { if (p) setImpressora(p) })

        const onDisconnect = () => {
            // recarrega state — pode ter perdido o device ativo
            obterImpressoraPareada().then((p) => setImpressora(p))
        }
        const onConnect = () => {
            obterImpressoraPareada().then((p) => { if (p) setImpressora(p) })
        }
        if (webUsbDisponivel()) {
            navigator.usb.addEventListener('disconnect', onDisconnect)
            navigator.usb.addEventListener('connect', onConnect)
        }
        if (webSerialDisponivel()) {
            navigator.serial.addEventListener('disconnect', onDisconnect)
            navigator.serial.addEventListener('connect', onConnect)
        }
        return () => {
            if (webUsbDisponivel()) {
                navigator.usb.removeEventListener('disconnect', onDisconnect)
                navigator.usb.removeEventListener('connect', onConnect)
            }
            if (webSerialDisponivel()) {
                navigator.serial.removeEventListener('disconnect', onDisconnect)
                navigator.serial.removeEventListener('connect', onConnect)
            }
        }
    }, [])

    // Tenta USB; se "Access Denied" (driver kernel-mode segura), oferece Serial.
    const parear = useCallback(async () => {
        if (webUsbDisponivel()) {
            try {
                const device = await pedirImpressoraUSB()
                if (!device) return  // usuario cancelou
                // tenta abrir pra validar acesso ANTES de salvar
                await device.open()
                await device.close()
                setImpressora({ tipo: 'usb', device })
                toast.success('Impressora conectada via USB!', {
                    description: 'A partir de agora, os cupons saem automaticamente.',
                })
                return
            } catch (err: any) {
                const isAccessDenied = err?.message?.includes('Access denied') || err?.name === 'SecurityError'
                if (isAccessDenied) {
                    toast.warning('USB direto bloqueado pelo Windows', {
                        description: 'O driver da impressora segura o USB. Tente "Conectar via Porta Serial".',
                        duration: 7000,
                    })
                    return
                }
                if (err?.name !== 'NotFoundError') {
                    toast.error('Falha ao conectar via USB', { description: err?.message })
                    return
                }
            }
        }
    }, [])

    const pearSerial = useCallback(async () => {
        if (!webSerialDisponivel()) {
            toast.error('Navegador nao suporta WebSerial', { description: 'Use Chrome ou Edge.' })
            return
        }
        try {
            const port = await pedirImpressoraSerial()
            if (!port) return
            await port.open({ baudRate: 9600 })
            await port.close()
            setImpressora({ tipo: 'serial', port })
            toast.success('Impressora conectada via Porta Serial!', {
                description: 'A partir de agora, os cupons saem automaticamente.',
            })
        } catch (err: any) {
            toast.error('Falha ao conectar via Serial', { description: err?.message })
        }
    }, [])

    const imprimir = useCallback(async (dados: DadosImpressaoNFCe): Promise<boolean> => {
        if (!impressora) {
            toast.warning('Impressora nao configurada', {
                description: 'Cupom emitido mas nao impresso. Conecte uma impressora no botao "Conectar".',
            })
            return false
        }
        try {
            await imprimirNFCe(impressora, dados)
            return true
        } catch (err: any) {
            toast.error('Falha na impressao', {
                description: err?.message ?? 'Verifique papel, conexao e tente novamente.',
            })
            return false
        }
    }, [impressora])

    return (
        <PrinterContext.Provider
            value={{
                suportado,
                conectada: !!impressora,
                tipoConexao: impressora?.tipo ?? null,
                parear,
                pearSerial,
                imprimir,
            }}
        >
            {children}
        </PrinterContext.Provider>
    )
}

export function useThermalPrinter(): PrinterCtx {
    const ctx = useContext(PrinterContext)
    if (!ctx) {
        return {
            suportado: false,
            conectada: false,
            tipoConexao: null,
            parear: async () => {},
            pearSerial: async () => {},
            imprimir: async () => false,
        }
    }
    return ctx
}
