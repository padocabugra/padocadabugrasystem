import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DescontoModal from '@/components/shared/DescontoModal'

describe('DescontoModal', () => {
    beforeEach(() => vi.clearAllMocks())

    it('aplica desconto em R$ e dispara onAplicar com o valor + onClose', () => {
        const onAplicar = vi.fn()
        const onClose = vi.fn()
        render(<DescontoModal totalBruto={100} descontoAtual={0} onAplicar={onAplicar} onClose={onClose} />)

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '10' } })
        fireEvent.click(screen.getByRole('button', { name: /Aplicar desconto/i }))

        expect(onAplicar).toHaveBeenCalledWith(10)
        expect(onClose).toHaveBeenCalled()
    })

    it('aplica desconto percentual via atalho (10% de 100 = 10)', () => {
        const onAplicar = vi.fn()
        render(<DescontoModal totalBruto={100} descontoAtual={0} onAplicar={onAplicar} onClose={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: /Percentual/i }))
        fireEvent.click(screen.getByRole('button', { name: '10%' }))
        fireEvent.click(screen.getByRole('button', { name: /Aplicar desconto/i }))

        expect(onAplicar).toHaveBeenCalledWith(10)
    })

    it('bloqueia desconto que zera o total (botão desabilitado + aviso)', () => {
        const onAplicar = vi.fn()
        render(<DescontoModal totalBruto={50} descontoAtual={0} onAplicar={onAplicar} onClose={vi.fn()} />)

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '50' } })

        const aplicar = screen.getByRole('button', { name: /Aplicar desconto/i })
        expect(aplicar).toBeDisabled()
        expect(screen.getByText(/não pode zerar o total/i)).toBeInTheDocument()
        fireEvent.click(aplicar)
        expect(onAplicar).not.toHaveBeenCalled()
    })

    it('mostra "Remover" quando já há desconto e zera ao remover', () => {
        const onAplicar = vi.fn()
        const onClose = vi.fn()
        render(<DescontoModal totalBruto={100} descontoAtual={15} onAplicar={onAplicar} onClose={onClose} />)

        const remover = screen.getByRole('button', { name: /Remover/i })
        fireEvent.click(remover)

        expect(onAplicar).toHaveBeenCalledWith(0)
        expect(onClose).toHaveBeenCalled()
    })

    it('desconto em R$ nunca passa do total (clamp em 100)', () => {
        const onAplicar = vi.fn()
        render(<DescontoModal totalBruto={100} descontoAtual={0} onAplicar={onAplicar} onClose={vi.fn()} />)

        // 150 num total de 100 → clamp para 100 → zera o total → bloqueado
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '150' } })
        expect(screen.getByRole('button', { name: /Aplicar desconto/i })).toBeDisabled()
    })
})
