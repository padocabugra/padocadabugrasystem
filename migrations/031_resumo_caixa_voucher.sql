-- Migration 031: adiciona a forma de pagamento "voucher" ao resumo do caixa
--
-- Contexto: foi criada a forma de pagamento VOUCHER (cartão de benefício:
-- Alelo/Sodexo/VR/Ticket…). O resumo_caixa_dia quebrava as vendas em apenas
-- 4 baldes (dinheiro/pix/débito/crédito); sem esta atualização uma venda em
-- voucher entraria no total_vendas mas ficaria FORA de todos os baldes,
-- criando divergência no fechamento de caixa (soma das formas < total).
--
-- Correção: acrescenta o balde total_voucher. Voucher NÃO é dinheiro, então
-- não entra no saldo_esperado_dinheiro (idêntico a pix/débito/crédito) — o
-- fechar_caixa continua reaproveitando resumo_caixa_dia sem alteração.
--
-- Espelha a versão da migration 017; só muda o que envolve o voucher.

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
    v_total_voucher NUMERIC := 0;
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
        COALESCE(SUM(CASE WHEN forma_pagamento = 'credito' THEN total ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN forma_pagamento = 'voucher' THEN total ELSE 0 END), 0)
    INTO v_total_dinheiro, v_total_pix, v_total_debito, v_total_credito, v_total_voucher
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
    -- (voucher NAO entra aqui — nao e dinheiro em especie, igual pix/cartao)
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
        'total_voucher', v_total_voucher,
        'total_sangrias', v_total_sangrias,
        'total_reforcos', v_total_reforcos,
        'saldo_esperado_dinheiro', v_saldo_esperado_dinheiro
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
