-- =============================================
-- Migration 010: NFC-e fields em pedidos
--
-- Adiciona controle de emissão de NFC-e (Modelo 65) via Brasil NFe.
-- Idempotente: pode ser rodado múltiplas vezes sem efeito colateral.
-- =============================================

ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS chave_nfce TEXT,
    ADD COLUMN IF NOT EXISTS nfce_status TEXT DEFAULT 'pendente';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_nfce_status_check'
    ) THEN
        ALTER TABLE pedidos
            ADD CONSTRAINT pedidos_nfce_status_check
            CHECK (nfce_status IN ('pendente', 'emitida', 'erro', 'nao_aplicavel'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedidos_nfce_status ON pedidos(nfce_status);
