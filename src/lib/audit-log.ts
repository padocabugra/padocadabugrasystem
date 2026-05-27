import { createClient } from '@/lib/supabase/client'

/**
 * Tipos de ação padronizados para o Audit Log.
 * Formato: 'entidade.operacao'
 */
export type AuditAction =
    | 'estoque.ajuste'
    | 'estoque.entrada'
    | 'estoque.saida'
    | 'caixa.abertura'
    | 'caixa.fechamento'
    | 'caixa.sangria'
    | 'caixa.reforco'
    | 'caixa.venda'
    | 'usuario.criar'
    | 'usuario.ativar'
    | 'usuario.desativar'
    | 'nfce.emitir'
    | 'nfce.erro'
    | 'produto.criar'
    | 'produto.editar'
    | 'produto.deletar'
    | 'receita.deletar'
    | 'mobiliario.deletar'

interface AuditEntry {
    acao: AuditAction
    entidade: string
    entidade_id?: string
    detalhes?: Record<string, unknown>
    usuario_id?: string
    usuario_nome?: string
}

/**
 * Registra uma entrada no audit log.
 * Non-blocking — falhas no log não devem impedir a operação principal.
 *
 * Quando usuario_nome não é passado, busca em public.usuarios pelo usuario_id
 * (depende do fix 2026-05-19 que garante auth.users.id == public.usuarios.id).
 */
export async function registrarAuditLog(entry: AuditEntry): Promise<void> {
    try {
        const supabase = createClient()

        let userId = entry.usuario_id
        let userName = entry.usuario_nome

        if (!userId) {
            const { data: { user } } = await supabase.auth.getUser()
            userId = user?.id
        }

        // Sem nome explícito? Tenta buscar em public.usuarios pelo id.
        if (!userName && userId) {
            const { data: usuarioRow } = await supabase
                .from('usuarios')
                .select('nome')
                .eq('id', userId)
                .maybeSingle()
            if (usuarioRow?.nome) userName = usuarioRow.nome
        }

        const { error } = await supabase.from('audit_log').insert({
            usuario_id: userId ?? null,
            usuario_nome: userName ?? null,
            acao: entry.acao,
            entidade: entry.entidade,
            entidade_id: entry.entidade_id ?? null,
            detalhes: entry.detalhes ?? {},
        })

        if (error) console.error('[AUDIT_LOG] insert error:', entry.acao, error.message)
    } catch (err) {
        // Silencioso — o audit log não deve quebrar a operação principal
        console.error('[AUDIT_LOG] Falha ao registrar:', entry.acao, err)
    }
}
