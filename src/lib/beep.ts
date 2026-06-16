/**
 * Feedback sonoro opcional pra bipagem de código de barras no PDV.
 *
 * Tudo encapsulado em try/catch e checagem de ambiente: se o browser bloquear
 * áudio ou não suportar Web Audio, a venda segue normal — o som é só conforto
 * (confirma a leitura sem o operador precisar olhar pra tela). Áudio NUNCA pode
 * quebrar o fluxo de venda.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null
    try {
        if (!ctx) {
            const AC: typeof AudioContext | undefined =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
            if (!AC) return null
            ctx = new AC()
        }
        // Browsers suspendem o contexto até o 1º gesto; bipagem vem de um keydown
        // (gesto válido), então o resume é permitido.
        if (ctx.state === 'suspended') void ctx.resume()
        return ctx
    } catch {
        return null
    }
}

function tom(freq: number, atrasoSeg: number, durSeg: number, volume = 0.06): void {
    const c = getCtx()
    if (!c) return
    try {
        const osc = c.createOscillator()
        const gain = c.createGain()
        osc.type = 'square'
        osc.frequency.value = freq
        gain.gain.value = volume
        osc.connect(gain)
        gain.connect(c.destination)
        const inicio = c.currentTime + atrasoSeg
        osc.start(inicio)
        osc.stop(inicio + durSeg)
    } catch {
        /* silencioso */
    }
}

/** Bip curto e agudo — produto adicionado com sucesso. */
export function bipSucesso(): void {
    tom(880, 0, 0.08)
}

/** Dois bips graves — código não encontrado. */
export function bipErro(): void {
    tom(320, 0, 0.12)
    tom(320, 0.16, 0.12)
}
