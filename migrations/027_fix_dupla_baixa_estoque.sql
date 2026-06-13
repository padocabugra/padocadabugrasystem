-- =============================================================
-- Migration 027: corrige DUPLA BAIXA de estoque no finalizar_venda_pdv
--
-- Bug: ao pagar uma conta de mesa/comanda, o estoque caía 2×.
--   1) finalizar_venda_pdv faz UPDATE pedidos SET status='entregue', o que
--      dispara o trigger trg_baixar_estoque_entrega -> baixa estoque_atual de
--      cada item E registra a saída em movimentacao_estoque.
--   2) A própria função AINDA tinha um loop que baixava estoque_atual de novo
--      (sem registrar movimentação) -> segunda baixa, "fantasma".
--   Resultado: estoque_atual decrementado o DOBRO do vendido; o log de
--   movimentação (1×) ficava certo, mascarando o furo.
--
-- Correção: recria a função SEM o loop de estoque. O trigger passa a ser a
-- ÚNICA fonte da baixa (1× + movimentação registrada).
--
-- ATENÇÃO: isto PARA de furar daqui pra frente, mas NÃO conserta os saldos já
-- baixados em dobro no passado — é preciso reajustar via inventário.
--
-- (create_venda_rapida entra por INSERT, então o trigger AFTER UPDATE não
--  dispara nela; ela baixa 1× no próprio loop e NÃO é alterada aqui.)
--
-- Aplicar via: node apply-migration.cjs migrations/027_fix_dupla_baixa_estoque.sql
-- =============================================================

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

    -- Muda o status para 'entregue'. O trigger trg_baixar_estoque_entrega cuida
    -- da baixa de estoque + registro da movimentação. NÃO repetir a baixa aqui
    -- (era a causa da dupla baixa — ver cabeçalho).
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
END;
$$;

GRANT EXECUTE ON FUNCTION finalizar_venda_pdv(uuid, text, numeric, uuid, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
