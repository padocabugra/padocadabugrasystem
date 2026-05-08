-- =============================================
-- Migration 009: Venda Rápida (PDV no balcão)
--
-- Inclui:
-- 1. Correção do bug 'finalizado' -> 'entregue' na RPC finalizar_venda_pdv
--    (o enum status_pedido_enum não tem 'finalizado'; o status final correto é 'entregue').
-- 2. RPC create_venda_rapida: cria pedido entregue + itens + baixa estoque +
--    lança movimentação no caixa, tudo numa única transação atômica.
-- =============================================

-- ─────────────────────────────────────────────────────────
-- 1. Fix: finalizar_venda_pdv usa 'entregue' (não 'finalizado')
-- ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS finalizar_venda_pdv(uuid, text, numeric, uuid);

CREATE OR REPLACE FUNCTION finalizar_venda_pdv(
    p_pedido_id UUID,
    p_forma_pagamento TEXT,
    p_valor_pago NUMERIC,
    p_usuario_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total NUMERIC;
    v_novo_saldo NUMERIC;
    v_item RECORD;
BEGIN
    SELECT total INTO v_total FROM pedidos WHERE id = p_pedido_id AND status = 'pronto';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido não encontrado ou não está pronto.';
    END IF;

    UPDATE pedidos
    SET status = 'entregue',
        forma_pagamento = p_forma_pagamento
    WHERE id = p_pedido_id;

    SELECT saldo INTO v_novo_saldo
    FROM caixa
    WHERE usuario_id = p_usuario_id AND created_at >= current_date::timestamp
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        v_novo_saldo := 0;
    END IF;

    v_novo_saldo := v_novo_saldo + v_total;

    INSERT INTO caixa (usuario_id, tipo, valor, saldo, observacao)
    VALUES (p_usuario_id, 'venda', v_total, v_novo_saldo, 'Pagamento Mesa/Pedido: ' || p_pedido_id);

    FOR v_item IN SELECT produto_id, quantidade FROM itens_pedido WHERE pedido_id = p_pedido_id LOOP
        UPDATE produtos
        SET estoque_atual = estoque_atual - v_item.quantidade
        WHERE id = v_item.produto_id AND estoque_atual IS NOT NULL;
    END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────
-- 2. RPC create_venda_rapida (atômica)
--
-- Cria pedido já com status='entregue', insere itens, baixa estoque e
-- registra movimentação no caixa. Aborta se o usuário não tiver caixa
-- aberto no dia (mensagem prefixada 'CAIXA_FECHADO:' para o front tratar).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_venda_rapida(
    p_vendedor_id UUID,
    p_total NUMERIC,
    p_forma_pagamento TEXT,
    p_valor_pago NUMERIC DEFAULT 0,
    p_itens JSONB DEFAULT '[]'::jsonb,
    p_cliente_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido_id UUID;
    v_item JSONB;
    v_novo_saldo NUMERIC;
    v_abertura_existe BOOLEAN;
BEGIN
    IF p_total <= 0 THEN
        RAISE EXCEPTION 'Total da venda deve ser maior que zero.';
    END IF;

    IF jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION 'Venda sem itens.';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM caixa
        WHERE usuario_id = p_vendedor_id
          AND tipo = 'abertura'
          AND created_at >= current_date::timestamp
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
        tipo_pedido,
        status,
        forma_pagamento
    ) VALUES (
        p_cliente_id,
        NULL,
        NULL,
        p_vendedor_id,
        p_total,
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
      AND created_at >= current_date::timestamp
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        v_novo_saldo := 0;
    END IF;

    v_novo_saldo := v_novo_saldo + p_total;

    INSERT INTO caixa (usuario_id, tipo, valor, saldo, observacao)
    VALUES (
        p_vendedor_id,
        'venda',
        p_total,
        v_novo_saldo,
        'Venda Rápida — Pedido: ' || v_pedido_id
    );

    RETURN jsonb_build_object(
        'pedido_id', v_pedido_id,
        'novo_saldo', v_novo_saldo,
        'troco', GREATEST(p_valor_pago - p_total, 0)
    );
END;
$$;
