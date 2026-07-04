-- =============================================================
-- Migration 030: Observações no pedido (para a Nota de Pedido)
--
-- Contexto: a Nota de Pedido (comanda de produção + comprovante do
-- cliente, impressa na térmica após o pagamento) precisa exibir
-- observações do atendimento (ex: "sem cebola", "café sem açúcar").
--
-- O que faz:
--   1. Adiciona pedidos.observacoes (texto livre, opcional).
--   2. Recria create_pedido_completo com o parâmetro p_observacoes.
--      IMPORTANTE: preserva SECURITY DEFINER + SET search_path
--      (hardening da migr. 023) e TODA a lógica de destino/comanda
--      (migr. 019/021). Só adiciona a gravação de observacoes.
--
-- A assinatura muda (9 -> 10 args), então dropamos a de 9 args antes.
-- =============================================================

-- 1. Coluna de observações (opcional, texto livre)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- 2. Recria create_pedido_completo com p_observacoes ao final.
--    Drop da assinatura anterior (9 args, migr. 021) pra evitar overload
--    ambíguo no PostgREST.
DROP FUNCTION IF EXISTS public.create_pedido_completo(uuid, integer, uuid, numeric, tipo_pedido_enum, jsonb, uuid, boolean, boolean);

CREATE OR REPLACE FUNCTION public.create_pedido_completo(
    p_cliente_id uuid DEFAULT NULL::uuid,
    p_numero_mesa integer DEFAULT NULL::integer,
    p_vendedor_id uuid DEFAULT NULL::uuid,
    p_total numeric DEFAULT 0,
    p_tipo_pedido tipo_pedido_enum DEFAULT 'local'::tipo_pedido_enum,
    p_itens jsonb DEFAULT '[]'::jsonb,
    p_comanda_id uuid DEFAULT NULL::uuid,
    p_destino_cozinha boolean DEFAULT true,
    p_destino_cafeteria boolean DEFAULT false,
    p_observacoes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
        status, destino_cozinha, destino_cafeteria, observacoes
    ) VALUES (
        p_cliente_id, p_numero_mesa, p_vendedor_id, p_total, p_tipo_pedido, p_comanda_id,
        v_status, p_destino_cozinha, p_destino_cafeteria, NULLIF(TRIM(p_observacoes), '')
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
