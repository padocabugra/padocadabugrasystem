-- =============================================
-- Migration 008: Destino do pedido (Cozinha vs Direto p/ Caixa)
-- Adiciona p_destino_cozinha à RPC create_pedido_completo.
-- Quando FALSE, o pedido é criado já com status 'pronto', pulando a cozinha.
-- =============================================

CREATE OR REPLACE FUNCTION create_pedido_completo(
    p_cliente_id UUID DEFAULT NULL,
    p_numero_mesa INTEGER DEFAULT NULL,
    p_vendedor_id UUID DEFAULT NULL,
    p_total NUMERIC DEFAULT 0,
    p_tipo_pedido tipo_pedido_enum DEFAULT 'local',
    p_itens JSONB DEFAULT '[]'::jsonb,
    p_comanda_id UUID DEFAULT NULL,
    p_destino_cozinha BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido_id UUID;
    v_item JSONB;
    v_status TEXT;
BEGIN
    v_status := CASE WHEN p_destino_cozinha THEN 'pendente' ELSE 'pronto' END;

    IF p_comanda_id IS NOT NULL THEN
        UPDATE comandas SET status = 'ocupada', updated_at = NOW()
        WHERE id = p_comanda_id AND status = 'livre';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Comanda não está disponível (já ocupada ou bloqueada).';
        END IF;
    END IF;

    INSERT INTO pedidos (
        cliente_id,
        numero_mesa,
        vendedor_id,
        total,
        tipo_pedido,
        comanda_id,
        status
    ) VALUES (
        p_cliente_id,
        p_numero_mesa,
        p_vendedor_id,
        p_total,
        p_tipo_pedido,
        p_comanda_id,
        v_status
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
    END LOOP;

    RETURN jsonb_build_object('pedido_id', v_pedido_id);
END;
$$;
