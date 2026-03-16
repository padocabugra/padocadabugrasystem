-- =============================================
-- Migration: Adicionar tipo_pedido na tabela pedidos
-- Valores: 'local' (padrão) ou 'delivery'
-- =============================================

-- 1. Criar o enum
DO $$ BEGIN
    CREATE TYPE tipo_pedido_enum AS ENUM ('local', 'delivery');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Adicionar coluna com default 'local'
ALTER TABLE pedidos
ADD COLUMN IF NOT EXISTS tipo_pedido tipo_pedido_enum NOT NULL DEFAULT 'local';

-- 3. Índice para filtros rápidos
CREATE INDEX IF NOT EXISTS idx_pedidos_tipo_pedido ON pedidos (tipo_pedido);
