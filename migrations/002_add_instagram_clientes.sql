-- =============================================
-- Migration: Adicionar instagram na tabela clientes
-- =============================================

ALTER TABLE clientes
ADD COLUMN IF NOT EXISTS instagram TEXT DEFAULT NULL;
