'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { toast } from 'sonner'
import {
    obterImpressoraPareada,
    pedirImpressoraUSB,
    pedirImpressoraSerial,
    imprimirNFCe,
    imprimirFechamento,
    imprimirPedido,
    webUsbDisponivel,
    webSerialDisponivel,
    type ImpressoraPareada,
    type DadosImpressaoNFCe,
    type DadosImpressaoFechamento,
    type DadosImpressaoPedido,
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
    /** Imprime o comprovante de fechamento de caixa. Toast em caso de erro. */
    imprimirComprovanteFechamento: (dados: DadosImpressaoFechamento) => Promise<boolean>
    /** Imprime a Nota de Pedido (comanda/comprovante nao-fiscal). Toast em caso de erro. */
    imprimirComprovantePedido: (dados: DadosImpressaoPedido) => Promise<boolean>
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

    // Envia pra impressora com 1 retry resiliente: se a 1a tentativa falhar, o
    // handle pode ter ficado "dormente" (apos inatividade/sleep ou reconexao).
    // Reaver o device pareado (getDevices) e tentar de novo costuma resolver o
    // classico "as vezes nao sai". Throw se as duas tentativas falharem.
    const enviarComRetry = useCallback(async (
        alvoInicial: ImpressoraPareada,
        envio: (alvo: ImpressoraPareada) => Promise<void>,
    ): Promise<void> => {
        try {
            await envio(alvoInicial)
            return
        } catch (errPrimeira) {
            const fresh = await obterImpressoraPareada().catch(() => null)
            if (!fresh) throw errPrimeira
            setImpressora(fresh)
            await envio(fresh) // 2a tentativa com handle renovado
        }
    }, [])

    const imprimir = useCallback(async (dados: DadosImpressaoNFCe): Promise<boolean> => {
        // Se o state perdeu o device, tenta reaver antes de desistir.
        let alvo = impressora ?? await obterImpressoraPareada().catch(() => null)
        if (alvo && !impressora) setImpressora(alvo)
        if (!alvo) {
            toast.warning('Impressora nao configurada', {
                description: 'Cupom emitido mas nao impresso. Conecte uma impressora no botao "Conectar".',
            })
            return false
        }
        try {
            await enviarComRetry(alvo, (a) => imprimirNFCe(a, dados))
            return true
        } catch (err: any) {
            toast.error('Falha na impressao', {
                description: err?.message ?? 'Verifique papel, conexao e tente novamente.',
            })
            return false
        }
    }, [impressora, enviarComRetry])

    const imprimirComprovanteFechamento = useCallback(async (dados: DadosImpressaoFechamento): Promise<boolean> => {
        let alvo = impressora ?? await obterImpressoraPareada().catch(() => null)
        if (alvo && !impressora) setImpressora(alvo)
        if (!alvo) {
            toast.warning('Impressora nao configurada', {
                description: 'Fechamento registrado, mas o comprovante nao foi impresso. Conecte uma impressora no PDV.',
            })
            return false
        }
        try {
            await enviarComRetry(alvo, (a) => imprimirFechamento(a, dados))
            return true
        } catch (err: any) {
            toast.error('Falha ao imprimir o fechamento', {
                description: err?.message ?? 'Verifique papel, conexao e tente novamente.',
            })
            return false
        }
    }, [impressora, enviarComRetry])

    const imprimirComprovantePedido = useCallback(async (dados: DadosImpressaoPedido): Promise<boolean> => {
        let alvo = impressora ?? await obterImpressoraPareada().catch(() => null)
        if (alvo && !impressora) setImpressora(alvo)
        if (!alvo) {
            toast.warning('Impressora nao configurada', {
                description: 'Pedido pago, mas a nota nao foi impressa. Conecte uma impressora no PDV.',
            })
            return false
        }
        try {
            await enviarComRetry(alvo, (a) => imprimirPedido(a, dados))
            return true
        } catch (err: any) {
            toast.error('Falha ao imprimir a nota do pedido', {
                description: err?.message ?? 'Verifique papel, conexao e tente novamente.',
            })
            return false
        }
    }, [impressora, enviarComRetry])

    return (
        <PrinterContext.Provider
            value={{
                suportado,
                conectada: !!impressora,
                tipoConexao: impressora?.tipo ?? null,
                parear,
                pearSerial,
                imprimir,
                imprimirComprovanteFechamento,
                imprimirComprovantePedido,
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
            imprimirComprovanteFechamento: async () => false,
            imprimirComprovantePedido: async () => false,
        }
    }
    return ctx
}
