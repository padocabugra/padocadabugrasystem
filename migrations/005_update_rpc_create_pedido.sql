-- =============================================
-- Migration: Atualizar a RPC create_pedido_completo
-- para aceitar p_tipo_pedido
-- =============================================

-- Verifica se a função já existe e recria com o novo parâmetro
CREATE OR REPLACE FUNCTION create_pedido_completo(
    p_cliente_id UUID DEFAULT NULL,
    p_numero_mesa INTEGER DEFAULT NULL,
    p_vendedor_id UUID DEFAULT NULL,
    p_total NUMERIC DEFAULT 0,
    p_tipo_pedido tipo_pedido_enum DEFAULT 'local',
    p_itens JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido_id UUID;
    v_item JSONB;
BEGIN
    -- 1. Cria o pedido com tipo
    INSERT INTO pedidos (
        cliente_id,
        numero_mesa,
        vendedor_id,
        total,
        tipo_pedido,
        status
    ) VALUES (
        p_cliente_id,
        p_numero_mesa,
        p_vendedor_id,
        p_total,
        p_tipo_pedido,
        'pendente'
    )
    RETURNING id INTO v_pedido_id;

    -- 2. Insere os itens do pedido
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
