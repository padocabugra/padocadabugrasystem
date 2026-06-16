import { describe, it, expect } from 'vitest'
import { resolverBusca } from '@/lib/barcode'
import type { Produto } from '@/lib/types'

function makeProduto(over: Partial<Produto> & { id: string; nome: string }): Produto {
    return {
        created_at: '',
        updated_at: '',
        preco: 0,
        custo: 0,
        categoria: 'Outros',
        tipo: 'proprio',
        estoque_atual: 0,
        estoque_minimo: 0,
        unidade_medida: 'un',
        ativo: true,
        disponivel_venda: true,
        codigo: undefined,
        ncm: null,
        cfop: null,
        csosn: null,
        ...over,
    } as Produto
}

const produtos: Produto[] = [
    makeProduto({ id: '1', nome: 'Coca-Cola 2L', codigo: '7891000100103' }),
    makeProduto({ id: '2', nome: 'Pão Francês', codigo: 'PAO-FRA-50', unidade_medida: 'kg' }),
    makeProduto({ id: '3', nome: 'Água 500ml', codigo: '7891910000197' }),
    makeProduto({ id: '4', nome: 'Bolo de Chocolate', codigo: undefined }),
]

describe('resolverBusca', () => {
    it('acha por código de barras EAN-13 exato (bipagem)', () => {
        const r = resolverBusca(produtos, '7891000100103')
        expect(r.tipo).toBe('exato')
        if (r.tipo === 'exato') expect(r.produto.id).toBe('1')
    })

    it('acha por SKU interno exato, ignorando maiúsculas/minúsculas', () => {
        const r = resolverBusca(produtos, 'pao-fra-50')
        expect(r.tipo).toBe('exato')
        if (r.tipo === 'exato') expect(r.produto.id).toBe('2')
    })

    it('ignora espaços nas pontas do termo', () => {
        const r = resolverBusca(produtos, '  7891910000197  ')
        expect(r.tipo).toBe('exato')
        if (r.tipo === 'exato') expect(r.produto.id).toBe('3')
    })

    it('cai em "unico" quando a busca por nome sobra exatamente 1 produto', () => {
        const r = resolverBusca(produtos, 'bolo')
        expect(r.tipo).toBe('unico')
        if (r.tipo === 'unico') expect(r.produto.id).toBe('4')
    })

    it('retorna "nenhum" quando nenhum código/nome bate', () => {
        expect(resolverBusca(produtos, '0000000000000').tipo).toBe('nenhum')
    })

    it('retorna "nenhum" para termo vazio ou só espaços', () => {
        expect(resolverBusca(produtos, '   ').tipo).toBe('nenhum')
    })

    it('retorna "multiplos" quando o termo bate em vários produtos', () => {
        const r = resolverBusca(produtos, 'a')
        expect(r.tipo).toBe('multiplos')
    })

    it('produto sem código nunca casa como match exato', () => {
        // id 4 não tem código; buscar pelo nome completo cai em "unico", não "exato".
        const r = resolverBusca(produtos, 'Bolo de Chocolate')
        expect(r.tipo).toBe('unico')
    })
})
