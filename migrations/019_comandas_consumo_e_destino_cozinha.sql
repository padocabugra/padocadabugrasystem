-- =============================================================
-- Migration 019: Corrige o modelo REAL de comandas + separa Cozinha x Caixa
--
-- Diagnóstico (inspeção do banco em 2026-05-30):
--   * comandas.status é varchar com CHECK ('livre','consumo','bloqueada').
--     O valor de "ocupada" REAL é 'consumo' (não 'ocupada'). As migrations
--     007/008/014 assumiram 'ocupada' — valor que NÃO existe no banco.
--   * Dois triggers já gerenciam a comanda:
--       - fn_comanda_consumo_on_pedido (AFTER INSERT): marca 'consumo' quando
--         um pedido com comanda é criado (se a comanda estava 'livre').
--       - fn_comanda_liberar_on_pedido (AFTER UPDATE): libera ('livre') quando
--         o pedido vira entregue/cancelado E não há mais pedidos abertos na
--         comanda. >>> Ou seja: o banco JÁ SUPORTA várias rodadas por comanda.
--   * create_pedido_completo tinha um bloco redundante:
--         UPDATE comandas SET status='consumo' WHERE id=... AND status='livre';
--         IF NOT FOUND THEN RAISE EXCEPTION 'Comanda não está disponível...'
--     Esse IF NOT FOUND é o BUG: ao lançar uma 2ª rodada numa comanda que já
--     está 'consumo', o WHERE status='livre' não acha nada e ele REJEITA.
--   * fn_resetar_todas_comandas liberava WHERE status='ocupada' => não libera
--     nada (status real é 'consumo'). Por isso 90/100 comandas ficaram presas.
--
-- O que esta migration faz:
--   1. Adiciona pedidos.destino_cozinha (separa o que vai pra cozinha do que
--      vai direto pro caixa) — usado pra Cozinha NÃO mostrar venda direta.
--   2. Recria create_pedido_completo: remove o bloqueio de comanda (deixa os
--      triggers cuidarem) e grava destino_cozinha. Permite reusar a comanda.
--   3. Conserta fn_resetar_todas_comandas / fn_resetar_comanda para o status
--      real 'consumo' e limpa pedido_ativo_id.
--   4. Cleanup pontual: libera comandas 'consumo' órfãs (sem nenhum pedido
--      aberto) — corrige as ~90 presas por causa do bug acima.
-- =============================================================

-- 1. Coluna destino_cozinha (default TRUE = comportamento legado: vai pra cozinha)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS destino_cozinha BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. create_pedido_completo sem o bloqueio de comanda + grava destino_cozinha
CREATE OR REPLACE FUNCTION public.create_pedido_completo(
    p_cliente_id uuid DEFAULT NULL::uuid,
    p_numero_mesa integer DEFAULT NULL::integer,
    p_vendedor_id uuid DEFAULT NULL::uuid,
    p_total numeric DEFAULT 0,
    p_tipo_pedido tipo_pedido_enum DEFAULT 'local'::tipo_pedido_enum,
    p_itens jsonb DEFAULT '[]'::jsonb,
    p_comanda_id uuid DEFAULT NULL::uuid,
    p_destino_cozinha boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
    v_pedido_id UUID;
    v_item JSONB;
    v_status status_pedido;
BEGIN
    v_status := CASE WHEN p_destino_cozinha THEN 'pendente'::status_pedido ELSE 'pronto'::status_pedido END;

    -- Comanda é gerenciada pelos triggers fn_comanda_consumo_on_pedido (INSERT)
    -- e fn_comanda_liberar_on_pedido (pagamento). NÃO bloqueamos aqui — permite
    -- lançar várias rodadas na MESMA comanda durante o atendimento.

    INSERT INTO pedidos (
        cliente_id, numero_mesa, vendedor_id, total, tipo_pedido, comanda_id, status, destino_cozinha
    ) VALUES (
        p_cliente_id, p_numero_mesa, p_vendedor_id, p_total, p_tipo_pedido, p_comanda_id, v_status, p_destino_cozinha
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

-- 3a. Reset geral (Fim do Dia): liberar status='consumo' (estava 'ocupada')
CREATE OR REPLACE FUNCTION public.fn_resetar_todas_comandas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
    UPDATE comandas SET status='livre', pedido_ativo_id=NULL, updated_at=NOW()
    WHERE status='consumo';
END;
$fn$;

-- 3b. Reset de uma comanda: também limpa pedido_ativo_id
CREATE OR REPLACE FUNCTION public.fn_resetar_comanda(p_numero integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
    UPDATE comandas SET status='livre', pedido_ativo_id=NULL, updated_at=NOW()
    WHERE numero = p_numero;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda % nao encontrada.', p_numero;
    END IF;
END;
$fn$;

-- 4. Cleanup: libera comandas 'consumo' órfãs (sem nenhum pedido aberto).
--    Corrige as comandas que ficaram presas pelo bug do bloqueio + reset errado.
UPDATE comandas SET status='livre', pedido_ativo_id=NULL
WHERE status='consumo'
  AND id NOT IN (
      SELECT comanda_id FROM pedidos
      WHERE comanda_id IS NOT NULL AND status NOT IN ('entregue','cancelado')
  );

NOTIFY pgrst, 'reload schema';
