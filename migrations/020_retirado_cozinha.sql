-- =============================================================
-- Migration 020: Retirada na Cozinha (bump / pickup)
--
-- Problema: depois de "Pronto", o pedido fica preso na coluna PRONTO da cozinha
-- até o cliente PAGAR (o caixa só marca 'entregue' no pagamento). Num horário
-- cheio, a coluna PRONTO acumula tudo.
--
-- Solução padrão de KDS: quando o garçom PEGA o prato pronto, ele "baixa" (bump)
-- o card — sai da cozinha, mas o pedido CONTINUA 'pronto' e cobrável no caixa
-- (a conta da mesa/comanda só é paga no fim). Isso é separado do pagamento.
--
-- Adiciona flag retirado_cozinha. A Cozinha mostra só os NÃO retirados.
-- =============================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS retirado_cozinha BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
