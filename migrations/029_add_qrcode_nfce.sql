-- 029_add_qrcode_nfce.sql
-- Armazena a URL completa do QR-Code oficial da NFC-e (com hash CSC), extraída
-- do XML autorizado pela Brasil NFe. Necessário para que a REIMPRESSÃO do cupom
-- (PedidoDetalheModal) gere um QR válido — a chave de acesso sozinha não permite
-- recalcular o hash sem o CSC do contribuinte.
--
-- Notas emitidas ANTES desta migration ficam com qrcode_nfce NULL; nesses casos
-- a impressão cai no fallback (URL de consulta por chave, sem hash).

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS qrcode_nfce TEXT;

COMMENT ON COLUMN pedidos.qrcode_nfce IS
    'URL do QR-Code oficial da NFC-e (infNFeSupl/qrCode do XML autorizado), com hash CSC. NULL p/ notas antigas.';

-- Recarrega o schema cache do PostgREST p/ a coluna aparecer na API REST.
NOTIFY pgrst, 'reload schema';
