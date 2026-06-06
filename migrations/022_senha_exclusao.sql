-- =============================================================
-- Migration 022: Senha de Exclusão (aprovação ADM p/ cancelar pedido)
--
-- Contexto: no ambiente do garçom/vendedor, cancelar/excluir um pedido
-- passa a exigir a "Senha de Exclusão" definida pelo ADMIN. O admin
-- gerencia essa senha em Configurações > Usuários & Permissões.
--
-- Modelo:
--   * Tabela configuracoes_sistema (key/value) guarda a senha em texto
--     (requisito: o admin pode VISUALIZAR a senha). RLS bloqueia acesso
--     direto — todo acesso passa por RPCs SECURITY DEFINER.
--   * fn_set_senha_exclusao / fn_get_senha_exclusao: SÓ admin (checa
--     usuarios.role via auth.uid()).
--   * fn_verificar_senha_exclusao: qualquer usuário autenticado (vendedor)
--     pode VALIDAR a senha digitada, sem conseguir lê-la.
-- =============================================================

-- 1. Tabela key/value de configurações do sistema
CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
    chave       TEXT PRIMARY KEY,
    valor       TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS ligado SEM policy permissiva: o acesso direto (PostgREST) fica negado.
-- Tudo passa pelas RPCs SECURITY DEFINER abaixo (que ignoram RLS).
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

-- 2. Helper interno: o usuário logado é admin?
CREATE OR REPLACE FUNCTION public.fn_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE id = auth.uid() AND role = 'admin' AND ativo = TRUE
    );
$fn$;

-- 3. Definir/alterar a senha de exclusão (somente admin)
CREATE OR REPLACE FUNCTION public.fn_set_senha_exclusao(p_senha text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
    IF NOT public.fn_is_admin() THEN
        RAISE EXCEPTION 'Apenas administradores podem definir a senha de exclusão.';
    END IF;

    IF p_senha IS NULL OR length(btrim(p_senha)) < 4 THEN
        RAISE EXCEPTION 'A senha de exclusão deve ter pelo menos 4 caracteres.';
    END IF;

    INSERT INTO public.configuracoes_sistema (chave, valor, updated_at)
    VALUES ('senha_exclusao', btrim(p_senha), NOW())
    ON CONFLICT (chave) DO UPDATE
        SET valor = EXCLUDED.valor, updated_at = NOW();
END;
$fn$;

-- 4. Ler a senha atual (somente admin — requisito de visualização)
CREATE OR REPLACE FUNCTION public.fn_get_senha_exclusao()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
    v_valor text;
BEGIN
    IF NOT public.fn_is_admin() THEN
        RAISE EXCEPTION 'Apenas administradores podem visualizar a senha de exclusão.';
    END IF;

    SELECT valor INTO v_valor
    FROM public.configuracoes_sistema
    WHERE chave = 'senha_exclusao';

    RETURN v_valor;  -- NULL = ainda não configurada
END;
$fn$;

-- 5. Verificar a senha digitada (qualquer autenticado; não revela a senha)
--    Retorna TRUE só quando há senha configurada E ela confere.
CREATE OR REPLACE FUNCTION public.fn_verificar_senha_exclusao(p_senha text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
    v_valor text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autenticado.';
    END IF;

    SELECT valor INTO v_valor
    FROM public.configuracoes_sistema
    WHERE chave = 'senha_exclusao';

    IF v_valor IS NULL OR length(btrim(v_valor)) = 0 THEN
        RETURN FALSE;  -- nenhuma senha configurada => bloqueia
    END IF;

    RETURN btrim(coalesce(p_senha, '')) = btrim(v_valor);
END;
$fn$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION public.fn_set_senha_exclusao(text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_senha_exclusao()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verificar_senha_exclusao(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
