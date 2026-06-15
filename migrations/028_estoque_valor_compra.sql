-- =============================================================
-- Migration 028: VALOR da compra na entrada de estoque
--
-- Contexto: a entrada (movimentacao_estoque tipo='entrada') já registrava
-- nota fiscal, data e fornecedor (migr. 024), mas NÃO registrava "quanto foi
-- pago". Sem isso não há histórico de compras de verdade: a dona quer saber,
-- por produto, preço + quantidade + data + fornecedor de cada compra, e que
-- esse registro PERMANEÇA mesmo quando o estoque zera (o produto e suas
-- movimentações nunca são apagados, então o histórico é naturalmente perene).
--
-- valor_total    = quanto foi pago na compra inteira (o que ela lê na nota).
-- valor_unitario = custo por unidade, derivado (total / quantidade) no momento
--                  do registro. Guardado pronto pra exibição/relatório e pra
--                  não depender de divisão na hora de mostrar o histórico.
--
-- Só fazem sentido em 'entrada'; ficam NULL nas demais movimentações.
--
-- Aplicar via: node apply-migration.cjs migrations/028_estoque_valor_compra.sql
-- =============================================================

ALTER TABLE public.movimentacao_estoque
    ADD COLUMN IF NOT EXISTS valor_total    numeric,
    ADD COLUMN IF NOT EXISTS valor_unitario numeric;

-- Valores nunca negativos (NULL é permitido = entrada sem valor informado).
ALTER TABLE public.movimentacao_estoque
    DROP CONSTRAINT IF EXISTS movimentacao_estoque_valor_total_check;
ALTER TABLE public.movimentacao_estoque
    ADD CONSTRAINT movimentacao_estoque_valor_total_check
    CHECK (valor_total IS NULL OR valor_total >= 0);

NOTIFY pgrst, 'reload schema';
