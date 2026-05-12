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
 */
export async function registrarAuditLog(entry: AuditEntry): Promise<void> {
    try {
        const supabase = createClient()

        // Tenta obter o usuário atual para preencher automaticamente
        let userId = entry.usuario_id
        let userName = entry.usuario_nome

        if (!userId) {
            const { data: { user } } = await supabase.auth.getUser()
            userId = user?.id
        }

        await supabase.from('audit_log').insert({
            usuario_id: userId ?? null,
            usuario_nome: userName ?? null,
            acao: entry.acao,
            entidade: entry.entidade,
            entidade_id: entry.entidade_id ?? null,
            detalhes: entry.detalhes ?? {},
        })
    } catch {
        // Silencioso — o audit log não deve quebrar a operação principal
        console.error('[AUDIT_LOG] Falha ao registrar:', entry.acao)
    }
}
