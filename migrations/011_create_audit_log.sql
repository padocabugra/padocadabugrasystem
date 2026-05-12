-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  011 - Audit Log para Operações Sensíveis (Admin)              ║
-- ║  Registra: estoque, caixa, usuários, NFC-e, vendas             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- ── Tabela de Audit Log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usuario_nome TEXT,
    acao        TEXT NOT NULL,           -- ex: 'estoque.ajuste', 'caixa.sangria', 'usuario.criar'
    entidade    TEXT NOT NULL,           -- ex: 'produtos', 'caixa', 'usuarios'
    entidade_id TEXT,                    -- ID do registro afetado
    detalhes    JSONB DEFAULT '{}',     -- dados antes/depois, valores, etc.
    ip_address  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Índices para consultas eficientes ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_log_acao ON audit_log (acao);
CREATE INDEX IF NOT EXISTS idx_audit_log_entidade ON audit_log (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_usuario ON audit_log (usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);

-- ── RLS: somente admin pode ler, insert via authenticated ───────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Admin pode ver todos os logs
CREATE POLICY "admin_read_audit_log" ON audit_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- Qualquer usuário autenticado pode inserir logs (registrar suas ações)
CREATE POLICY "authenticated_insert_audit_log" ON audit_log
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Ninguém pode deletar ou atualizar logs (imutável)
-- (sem policy = negado por padrão com RLS ativo)
