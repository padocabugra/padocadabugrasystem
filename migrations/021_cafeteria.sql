-- =============================================================
-- Migration 021: Painel da Cafeteria (Café da Padoca da Bugra)
--
-- Contexto: com a abertura do Café, parte dos pedidos passa a ser
-- preparada na CAFETERIA (baristas) em vez da COZINHA. O fluxo de
-- produção é idêntico ao da cozinha (pendente → preparando → pronto →
-- retirada), mas com um painel próprio e fila própria.
--
-- Modelo escolhido (espelha o destino_cozinha já existente, migr. 019/020):
--   * pedidos.destino_cafeteria  — vai pra fila da Cafeteria.
--   * pedidos.retirado_cafeteria — "bump" (garçom/barista pegou o item),
--     sai do painel mas continua cobrável no Caixa enquanto 'pronto'.
--
-- Um pedido tem UM destino de produção (Cozinha OU Cafeteria) ou vai
-- direto pro Caixa. Ambas as flags FALSE = venda direta (status 'pronto').
-- Qualquer uma TRUE = entra na produção (status 'pendente').
--
-- O Caixa NÃO muda: ele lista todo pedido 'pronto', independente da origem.
-- =============================================================

-- 1. Colunas novas (default FALSE = pedido legado não vai pra cafeteria)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS destino_cafeteria  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS retirado_cafeteria BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Recria create_pedido_completo com o destino da cafeteria.
--    Removemos os overloads antigos (6-arg da migr.005 e 8-arg da 008/019)
--    pra deixar UMA única assinatura e evitar ambiguidade no PostgREST.
DROP FUNCTION IF EXISTS public.create_pedido_completo(uuid, integer, uuid, numeric, tipo_pedido_enum, jsonb);
DROP FUNCTION IF EXISTS public.create_pedido_completo(uuid, integer, uuid, numeric, tipo_pedido_enum, jsonb, uuid, boolean);

CREATE OR REPLACE FUNCTION public.create_pedido_completo(
    p_cliente_id uuid DEFAULT NULL::uuid,
    p_numero_mesa integer DEFAULT NULL::integer,
    p_vendedor_id uuid DEFAULT NULL::uuid,
    p_total numeric DEFAULT 0,
    p_tipo_pedido tipo_pedido_enum DEFAULT 'local'::tipo_pedido_enum,
    p_itens jsonb DEFAULT '[]'::jsonb,
    p_comanda_id uuid DEFAULT NULL::uuid,
    p_destino_cozinha boolean DEFAULT true,
    p_destino_cafeteria boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
    v_pedido_id UUID;
    v_item JSONB;
    v_status status_pedido;
BEGIN
    -- Vai pra produção (cozinha OU cafeteria) => 'pendente'.
    -- Venda direta (nenhum destino de produção) => já nasce 'pronto'.
    v_status := CASE
        WHEN p_destino_cozinha OR p_destino_cafeteria THEN 'pendente'::status_pedido
        ELSE 'pronto'::status_pedido
    END;

    -- Comanda é gerenciada pelos triggers fn_comanda_consumo_on_pedido (INSERT)
    -- e fn_comanda_liberar_on_pedido (pagamento). NÃO bloqueamos aqui — permite
    -- lançar várias rodadas na MESMA comanda durante o atendimento.

    INSERT INTO pedidos (
        cliente_id, numero_mesa, vendedor_id, total, tipo_pedido, comanda_id,
        status, destino_cozinha, destino_cafeteria
    ) VALUES (
        p_cliente_id, p_numero_mesa, p_vendedor_id, p_total, p_tipo_pedido, p_comanda_id,
        v_status, p_destino_cozinha, p_destino_cafeteria
    )
    RETURNING id INTO v_pedido_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
        INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco_unitario)
        VALUES (
            v_pedido_id,
            (v_item->>'produto_id')::UUID,
            (v_item->>'quantidade')::NUMERIC,
            (v_item->>'preco_unitario')::NUMERIC
        );
    END LOOP;

    RETURN jsonb_build_object('pedido_id', v_pedido_id);
END;
$fn$;

NOTIFY pgrst, 'reload schema';
