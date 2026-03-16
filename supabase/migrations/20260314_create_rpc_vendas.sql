-- Criação de funções RPC para gerenciar vendas (PDV Direto e Caixa Finalização) de forma atômica

-- 1. Finalizar venda vinda da Cozinha (CaixaClient)
DROP FUNCTION IF EXISTS finalizar_venda_pdv(uuid, text, numeric, uuid);

CREATE OR REPLACE FUNCTION finalizar_venda_pdv(
  p_pedido_id UUID,
  p_forma_pagamento TEXT,
  p_valor_pago NUMERIC,
  p_usuario_id UUID
) RETURNS void AS $$
DECLARE
  v_total NUMERIC;
  v_novo_saldo NUMERIC;
  v_item RECORD;
BEGIN
  -- Verificar pedido e pegar total
  SELECT total INTO v_total FROM pedidos WHERE id = p_pedido_id AND status = 'pronto';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não está pronto.';
  END IF;

  -- Atualizar pedido
  UPDATE pedidos
  SET status = 'finalizado',
      forma_pagamento = p_forma_pagamento
  WHERE id = p_pedido_id;

  -- Atualizar Caixa
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

  -- Baixar estoque dos itens
  FOR v_item IN SELECT produto_id, quantidade FROM itens_pedido WHERE pedido_id = p_pedido_id LOOP
    UPDATE produtos
    SET estoque_atual = estoque_atual - v_item.quantidade
    WHERE id = v_item.produto_id AND estoque_atual IS NOT NULL;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
