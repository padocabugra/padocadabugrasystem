-- =============================================
-- Migration: Adicionar código (SKU) na tabela produtos
-- =============================================

ALTER TABLE produtos
ADD COLUMN IF NOT EXISTS codigo TEXT DEFAULT NULL;

-- Índice único para evitar códigos duplicados (ignora nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_codigo_unique
ON produtos (codigo)
WHERE codigo IS NOT NULL;
