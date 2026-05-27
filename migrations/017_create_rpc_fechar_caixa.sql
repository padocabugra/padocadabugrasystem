-- Migration 017: RPC fechar_caixa + resumo_caixa_dia
--
-- Adiciona fechamento manual de caixa. A Bugra pediu botao explicito
-- pra ter controle total — antes o caixa "fechava" so virtualmente ao
-- virar a meia-noite (filtro >= inicio_dia_cg).
--
-- Comportamento:
-- - resumo_caixa_dia: retorna agregados do dia (abertura, vendas por
--   forma de pagamento, sangrias, reforcos, saldo esperado em dinheiro).
--   Usado pelo modal de fechamento pra mostrar conferencia.
-- - fechar_caixa: registra tipo='fechamento' na tabela caixa com o
--   valor contado pelo operador + observacao com diferenca calculada.
--   Falha se nao houver abertura ativa ou se ja houver fechamento
--   posterior a abertura (re-fechamento bloqueado; reabrir = nova
--   abertura entra normalmente porque o filtro pega a mais recente).
--
-- A coluna `caixa.tipo` é do enum `tipo_caixa` (NÃO é TEXT com CHECK).
-- Basta adicionar o novo valor ao enum — o proprio enum ja restringe.
-- IMPORTANTE: ALTER TYPE ... ADD VALUE precisa ser commitado antes de
-- ser usado nas funcoes abaixo. Rode em duas execucoes separadas no
-- SQL Editor:
--   1) ALTER TYPE tipo_caixa ADD VALUE IF NOT EXISTS 'fechamento';
--   2) os dois CREATE OR REPLACE FUNCTION.
-- Aplicada em prod 2026-05-26.

ALTER TYPE tipo_caixa ADD VALUE IF NOT EXISTS 'fechamento';

-- ─────────────────────────────────────────────────────────
-- resumo_caixa_dia: agregados do turno atual
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION resumo_caixa_dia(p_usuario_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inicio_dia_cg TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'America/Campo_Grande')
                                   AT TIME ZONE 'America/Campo_Grande';
    v_abertura_id UUID;
    v_abertura_created TIMESTAMPTZ;
    v_abertura_valor NUMERIC := 0;
    v_saldo_atual NUMERIC := 0;
    v_total_vendas NUMERIC := 0;
    v_total_dinheiro NUMERIC := 0;
    v_total_pix NUMERIC := 0;
    v_total_debito NUMERIC := 0;
    v_total_credito NUMERIC := 0;
    v_total_sangrias NUMERIC := 0;
    v_total_reforcos NUMERIC := 0;
    v_qtd_vendas INTEGER := 0;
    v_saldo_esperado_dinheiro NUMERIC := 0;
BEGIN
    -- Pega a abertura mais recente do dia (a "ativa" deve ser a ultima)
    SELECT id, created_at, valor
    INTO v_abertura_id, v_abertura_created, v_abertura_valor
    FROM caixa
    WHERE usuario_id = p_usuario_id
      AND tipo = 'abertura'
      AND created_at >= v_inicio_dia_cg
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_abertura_id IS NULL THEN
        RETURN jsonb_build_object('aberto', false);
    END IF;

    -- Saldo corrente (ultima movimentacao do turno)
    SELECT saldo INTO v_saldo_atual
    FROM caixa
    WHERE usuario_id = p_usuario_id
      AND created_at >= v_abertura_created
    ORDER BY created_at DESC
    LIMIT 1;

    -- Total vendas do turno (todas as inserções tipo='venda' desde abertura)
    SELECT COALESCE(SUM(valor), 0), COUNT(*)
    INTO v_total_vendas, v_qtd_vendas
    FROM caixa
    WHERE usuario_id = p_usuario_id
      AND tipo = 'venda'
      AND created_at >= v_abertura_created;

    -- Quebra por forma de pagamento via tabela pedidos
    -- (pedidos.forma_pagamento + status='entregue' + data >= abertura)
    SELECT
        COALESCE(SUM(CASE WHEN forma_pagamento = 'dinheiro' THEN total ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN forma_pagamento = 'pix' THEN total ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN forma_pagamento = 'debito' THEN total ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN forma_pagamento = 'credito' THEN total ELSE 0 END), 0)
    INTO v_total_dinheiro, v_total_pix, v_total_debito, v_total_credito
    FROM pedidos
    WHERE status = 'entregue'
      AND created_at >= v_abertura_created;

    -- Sangrias e reforcos do turno
    SELECT COALESCE(SUM(valor), 0) INTO v_total_sangrias
    FROM caixa
    WHERE usuario_id = p_usuario_id
      AND tipo = 'sangria'
      AND created_at >= v_abertura_created;

    SELECT COALESCE(SUM(valor), 0) INTO v_total_reforcos
    FROM caixa
    WHERE usuario_id = p_usuario_id
      AND tipo = 'reforco'
      AND created_at >= v_abertura_created;

    -- Saldo esperado em dinheiro = abertura + vendas dinheiro - sangrias + reforcos
    v_saldo_esperado_dinheiro := v_abertura_valor + v_total_dinheiro - v_total_sangrias + v_total_reforcos;

    RETURN jsonb_build_object(
        'aberto', true,
        'abertura_id', v_abertura_id,
        'abertura_em', v_abertura_created,
        'abertura_valor', v_abertura_valor,
        'saldo_atual', v_saldo_atual,
        'total_vendas', v_total_vendas,
        'qtd_vendas', v_qtd_vendas,
        'total_dinheiro', v_total_dinheiro,
        'total_pix', v_total_pix,
        'total_debito', v_total_debito,
        'total_credito', v_total_credito,
        'total_sangrias', v_total_sangrias,
        'total_reforcos', v_total_reforcos,
        'saldo_esperado_dinheiro', v_saldo_esperado_dinheiro
    );
END;
$$;

-- ─────────────────────────────────────────────────────────
-- fechar_caixa: registra fechamento manual com conferencia
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fechar_caixa(
    p_usuario_id UUID,
    p_valor_contado NUMERIC,
    p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inicio_dia_cg TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'America/Campo_Grande')
                                   AT TIME ZONE 'America/Campo_Grande';
    v_abertura_id UUID;
    v_abertura_created TIMESTAMPTZ;
    v_resumo JSONB;
    v_saldo_esperado NUMERIC;
    v_diferenca NUMERIC;
    v_obs_final TEXT;
    v_fechamento_id UUID;
BEGIN
    IF p_valor_contado IS NULL OR p_valor_contado < 0 THEN
        RAISE EXCEPTION 'Valor contado invalido.';
    END IF;

    -- Verifica abertura ativa
    SELECT id, created_at INTO v_abertura_id, v_abertura_created
    FROM caixa
    WHERE usuario_id = p_usuario_id
      AND tipo = 'abertura'
      AND created_at >= v_inicio_dia_cg
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_abertura_id IS NULL THEN
        RAISE EXCEPTION 'SEM_ABERTURA: Nao ha caixa aberto para fechar.';
    END IF;

    -- Bloqueia re-fechamento na mesma abertura
    IF EXISTS (
        SELECT 1 FROM caixa
        WHERE usuario_id = p_usuario_id
          AND tipo = 'fechamento'
          AND created_at > v_abertura_created
    ) THEN
        RAISE EXCEPTION 'JA_FECHADO: Este turno ja foi fechado. Abra um novo caixa para continuar.';
    END IF;

    -- Reaproveita resumo_caixa_dia pra calcular esperado
    v_resumo := resumo_caixa_dia(p_usuario_id);
    v_saldo_esperado := (v_resumo->>'saldo_esperado_dinheiro')::NUMERIC;
    v_diferenca := p_valor_contado - v_saldo_esperado;

    v_obs_final := 'Fechamento manual. Esperado em dinheiro: ' || v_saldo_esperado::TEXT
                || '. Contado: ' || p_valor_contado::TEXT
                || '. Diferenca: ' || v_diferenca::TEXT
                || CASE WHEN p_observacao IS NOT NULL AND length(trim(p_observacao)) > 0
                        THEN '. Obs: ' || p_observacao
                        ELSE '' END;

    INSERT INTO caixa (usuario_id, tipo, valor, saldo, observacao)
    VALUES (p_usuario_id, 'fechamento', p_valor_contado, 0, v_obs_final)
    RETURNING id INTO v_fechamento_id;

    RETURN jsonb_build_object(
        'ok', true,
        'fechamento_id', v_fechamento_id,
        'saldo_esperado_dinheiro', v_saldo_esperado,
        'valor_contado', p_valor_contado,
        'diferenca', v_diferenca,
        'resumo', v_resumo
    );
END;
$$;
