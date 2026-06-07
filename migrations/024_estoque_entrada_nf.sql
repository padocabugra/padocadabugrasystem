-- =============================================================
-- Migration 024: Dados de compra na entrada de estoque
--
-- Contexto: a entrada de mercadoria (movimentacao_estoque tipo='entrada')
-- não registrava nota fiscal, data da compra nem fornecedor — sem controle
-- do que entra na empresa. Adiciona os 3 campos (texto livre p/ fornecedor;
-- um cadastro de fornecedores fica como evolução futura).
--
-- Campos só fazem sentido em 'entrada'; ficam NULL nas demais movimentações.
-- =============================================================

ALTER TABLE public.movimentacao_estoque
    ADD COLUMN IF NOT EXISTS numero_nota_fiscal text,
    ADD COLUMN IF NOT EXISTS data_compra        date,
    ADD COLUMN IF NOT EXISTS fornecedor         text;

-- Índices leves p/ consultas do histórico de entradas (por data e fornecedor)
CREATE INDEX IF NOT EXISTS idx_mov_estoque_data_compra ON public.movimentacao_estoque (data_compra);
CREATE INDEX IF NOT EXISTS idx_mov_estoque_fornecedor  ON public.movimentacao_estoque (fornecedor);

NOTIFY pgrst, 'reload schema';
