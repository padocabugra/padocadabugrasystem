-- =============================================================
-- Migration 023: Hardening das funções SECURITY DEFINER (achados do pentest)
--
-- F3 — search_path mutável: funções SECURITY DEFINER sem `SET search_path`
--   são vulneráveis a "search_path hijack" (objeto em pg_temp mascarando
--   tabelas referenciadas sem schema, ex.: `usuarios` em fn_is_admin).
--   Fixar a path com pg_temp por ÚLTIMO neutraliza o vetor.
--
-- F2 — least privilege: as RPCs de senha não precisam ser executáveis por
--   `anon`/`PUBLIC`. fn_is_admin é helper interno (chamado de dentro de
--   outras SECURITY DEFINER, que rodam como owner) — não deve ser chamável
--   diretamente pelo client.
-- =============================================================

-- F3: pin search_path (pg_temp por último = não é pesquisado primeiro)
ALTER FUNCTION public.fn_is_admin()                       SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_set_senha_exclusao(text)         SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_get_senha_exclusao()             SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_verificar_senha_exclusao(text)   SET search_path = public, pg_temp;
-- Pré-existentes, mesma classe de risco:
ALTER FUNCTION public.create_pedido_completo(uuid, integer, uuid, numeric, tipo_pedido_enum, jsonb, uuid, boolean, boolean)
                                                          SET search_path = public, pg_temp;
ALTER FUNCTION public.finalizar_venda_pdv(uuid, text, numeric, uuid)
                                                          SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_resetar_comanda(integer)         SET search_path = public, pg_temp;

-- F2: least privilege nas RPCs de senha
REVOKE EXECUTE ON FUNCTION public.fn_is_admin()                     FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_set_senha_exclusao(text)       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_get_senha_exclusao()           FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_verificar_senha_exclusao(text) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_set_senha_exclusao(text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_senha_exclusao()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verificar_senha_exclusao(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
