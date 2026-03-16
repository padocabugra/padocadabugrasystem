-- =============================================
-- Migration: Criar tabela mobiliario_empresa
-- Inventário de bens físicos da empresa
-- =============================================

-- 1. Criar enum para condição
DO $$ BEGIN
    CREATE TYPE condicao_mobiliario AS ENUM ('novo', 'usado');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Criar tabela
CREATE TABLE IF NOT EXISTS mobiliario_empresa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    marca TEXT DEFAULT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
    condicao condicao_mobiliario NOT NULL DEFAULT 'novo',
    observacao TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RLS
ALTER TABLE mobiliario_empresa ENABLE ROW LEVEL SECURITY;

-- Política: apenas admins podem ver/editar
CREATE POLICY "Admin full access on mobiliario"
ON mobiliario_empresa
FOR ALL
USING (true)
WITH CHECK (true);
