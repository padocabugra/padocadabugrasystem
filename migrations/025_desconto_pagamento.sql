-- =============================================================
-- Migration 025: Desconto no momento do pagamento (Caixa + Venda Rápida)
--
-- A cliente pode conceder um desconto (em R$ ou %) ao receber o pagamento.
--
-- Decisão de modelo: `pedidos.total` passa a guardar o valor LÍQUIDO (já com
-- o desconto aplicado). Assim TODO o fluxo que deriva de pedidos.total — o
-- movimento de caixa (finalizar_venda_pdv), o resumo/fechamento de turno
-- (resumo_caixa_dia / fechar_caixa) e os relatórios — reflete o valor
-- realmente recebido, sem precisar tocar em cada agregação.
--
-- A coluna `pedidos.desconto` registra QUANTO foi concedido (R$), para o
-- cupom, relatórios e auditoria. bruto = total + desconto.
--
-- Na conta do Caixa (que pode reunir vários pedidos) o desconto é distribuído
-- proporcionalmente entre os pedidos no client; cada finalizar_venda_pdv
-- recebe a parcela do seu pedido em p_desconto.
--
-- A NFC-e recebe o desconto rateado por item (ValorDesconto) no código
-- (brasilnfe.ts), preservando Σitens − Σdesconto = total da nota (SEFAZ).
--
-- Aplicar via: node apply-migration.cjs migrations/025_desconto_pagamento.sql
-- (não tem ALTER TYPE; pode rodar o arquivo inteiro de uma vez).
-- =============================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS desconto NUMERIC NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────
-- finalizar_venda_pdv: agora aceita p_desconto (parcela do pedido).
-- Grava total líquido + desconto no pedido e lança o líquido no caixa.
-- ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS finalizar_venda_pdv(uuid, text, numeric, uuid);

CREATE OR REPLACE FUNCTION finalizar_venda_pdv(
    p_pedido_id UUID,
    p_forma_pagamento TEXT,
    p_valor_pago NUMERIC,
    p_usuario_id UUID,
    p_desconto NUMERIC DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_bruto NUMERIC;
    v_desconto NUMERIC;
    v_liquido NUMERIC;
    v_novo_saldo NUMERIC;
    v_item RECORD;
    v_inicio_dia_cg TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'America/Campo_Grande')
                                   AT TIME ZONE 'America/Campo_Grande';
BEGIN
    SELECT total INTO v_bruto FROM pedidos WHERE id = p_pedido_id AND status = 'pronto';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido não encontrado ou não está pronto.';
    END IF;

    -- Sanitiza: desconto nunca negativo nem maior que o bruto do pedido.
    v_desconto := LEAST(GREATEST(COALESCE(p_desconto, 0), 0), v_bruto);
    v_liquido := round(v_bruto - v_desconto, 2);

    UPDATE pedidos
    SET status = 'entregue',
        forma_pagamento = p_forma_pagamento,
        total = v_liquido,
        desconto = v_desconto
    WHERE id = p_pedido_id;

    SELECT saldo INTO v_novo_saldo
    FROM caixa
    WHERE usuario_id = p_usuario_id AND created_at >= v_inicio_dia_cg
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        v_novo_saldo := 0;
    END IF;

    v_novo_saldo := v_novo_saldo + v_liquido;

    INSERT INTO caixa (usuario_id, tipo, valor, saldo, observacao)
    VALUES (
        p_usuario_id, 'venda', v_liquido, v_novo_saldo,
        'Pagamento Mesa/Pedido: ' || p_pedido_id
        || CASE WHEN v_desconto > 0 THEN ' (desconto R$ ' || v_desconto || ')' ELSE '' END
    );

    FOR v_item IN SELECT produto_id, quantidade FROM itens_pedido WHERE pedido_id = p_pedido_id LOOP
        UPDATE produtos
        SET estoque_atual = estoque_atual - v_item.quantidade
        WHERE id = v_item.produto_id AND estoque_atual IS NOT NULL;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION finalizar_venda_pdv(uuid, text, numeric, uuid, numeric) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- create_venda_rapida: idem para o balcão (Venda Rápida).
-- p_total continua sendo o BRUTO (soma dos itens); a função aplica o
-- desconto e grava o líquido no pedido e no caixa.
-- ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS create_venda_rapida(uuid, numeric, text, numeric, jsonb, uuid);

CREATE OR REPLACE FUNCTION create_venda_rapida(
    p_vendedor_id UUID,
    p_total NUMERIC,
    p_forma_pagamento TEXT,
    p_valor_pago NUMERIC DEFAULT 0,
    p_itens JSONB DEFAULT '[]'::jsonb,
    p_cliente_id UUID DEFAULT NULL,
    p_desconto NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pedido_id UUID;
    v_item JSONB;
    v_desconto NUMERIC;
    v_liquido NUMERIC;
    v_novo_saldo NUMERIC;
    v_abertura_existe BOOLEAN;
    v_inicio_dia_cg TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'America/Campo_Grande')
                                   AT TIME ZONE 'America/Campo_Grande';
BEGIN
    IF p_total <= 0 THEN
        RAISE EXCEPTION 'Total da venda deve ser maior que zero.';
    END IF;

    IF jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION 'Venda sem itens.';
    END IF;

    v_desconto := LEAST(GREATEST(COALESCE(p_desconto, 0), 0), p_total);
    v_liquido := round(p_total - v_desconto, 2);

    IF v_liquido <= 0 THEN
        RAISE EXCEPTION 'Desconto não pode zerar o total da venda.';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM caixa
        WHERE usuario_id = p_vendedor_id
          AND tipo = 'abertura'
          AND created_at >= v_inicio_dia_cg
    ) INTO v_abertura_existe;

    IF NOT v_abertura_existe THEN
        RAISE EXCEPTION 'CAIXA_FECHADO: Abra o caixa antes de realizar vendas rápidas.';
    END IF;

    INSERT INTO pedidos (
        cliente_id,
        numero_mesa,
        comanda_id,
        vendedor_id,
        total,
        desconto,
        tipo_pedido,
        status,
        forma_pagamento
    ) VALUES (
        p_cliente_id,
        NULL,
        NULL,
        p_vendedor_id,
        v_liquido,
        v_desconto,
        'local',
        'entregue',
        p_forma_pagamento
    )
    RETURNING id INTO v_pedido_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
        INSERT INTO itens_pedido (
            pedido_id,
            produto_id,
            quantidade,
            preco_unitario
        ) VALUES (
            v_pedido_id,
            (v_item->>'produto_id')::UUID,
            (v_item->>'quantidade')::NUMERIC,
            (v_item->>'preco_unitario')::NUMERIC
        );

        UPDATE produtos
        SET estoque_atual = estoque_atual - (v_item->>'quantidade')::NUMERIC,
            updated_at = NOW()
        WHERE id = (v_item->>'produto_id')::UUID
          AND estoque_atual IS NOT NULL;
    END LOOP;

    SELECT saldo INTO v_novo_saldo
    FROM caixa
    WHERE usuario_id = p_vendedor_id
      AND created_at >= v_inicio_dia_cg
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        v_novo_saldo := 0;
    END IF;

    v_novo_saldo := v_novo_saldo + v_liquido;

    INSERT INTO caixa (usuario_id, tipo, valor, saldo, observacao)
    VALUES (
        p_vendedor_id,
        'venda',
        v_liquido,
        v_novo_saldo,
        'Venda Rápida — Pedido: ' || v_pedido_id
        || CASE WHEN v_desconto > 0 THEN ' (desconto R$ ' || v_desconto || ')' ELSE '' END
    );

    RETURN jsonb_build_object(
        'pedido_id', v_pedido_id,
        'novo_saldo', v_novo_saldo,
        'troco', GREATEST(p_valor_pago - v_liquido, 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_venda_rapida(uuid, numeric, text, numeric, jsonb, uuid, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
