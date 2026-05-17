-- =============================================
-- Migration 014: Reaplica RPCs de comandas
-- Diagnóstico: em produção a tabela `comandas` existe, porém as funções
-- fn_resetar_comanda, fn_bloquear_comanda e fn_resetar_todas_comandas
-- estão ausentes do schema cache (PGRST202 ao chamá-las).
-- Esta migration é segura para rodar várias vezes (CREATE OR REPLACE).
-- =============================================

CREATE OR REPLACE FUNCTION fn_resetar_comanda(p_numero INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE comandas SET status = 'livre', updated_at = NOW()
    WHERE numero = p_numero;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda % não encontrada.', p_numero;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_bloquear_comanda(p_numero INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE comandas SET status = 'bloqueada', updated_at = NOW()
    WHERE numero = p_numero;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda % não encontrada.', p_numero;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_resetar_todas_comandas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE comandas SET status = 'livre', updated_at = NOW()
    WHERE status = 'ocupada';
END;
$$;

-- Garante execução pelos roles do PostgREST
GRANT EXECUTE ON FUNCTION fn_resetar_comanda(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_bloquear_comanda(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_resetar_todas_comandas() TO authenticated;

-- Força o PostgREST a recarregar o schema cache
NOTIFY pgrst, 'reload schema';
