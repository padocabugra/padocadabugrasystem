-- Migration 033: armazenamento dos XMLs autorizados das NFC-e (contabilidade)
--
-- Contexto: a contabilidade precisa dos ARQUIVOS XML das notas (documento fiscal
-- que eles importam no sistema deles). O emissor (BrasilNFE) devolve o XML em
-- Base64 (campo Base64Xml) a cada emissão, mas até então a gente extraía só o
-- QR-Code e DESCARTAVA o XML. Esta tabela passa a guardá-lo.
--
-- Modelagem: chave-por-documento. Uma conta pode reunir vários pedidos sob UMA
-- NFC-e (uma chave) — por isso a tabela é keyed pela CHAVE (não por pedido),
-- evitando duplicar o mesmo XML N vezes. pedidos.chave_nfce faz o vínculo lógico.
--
-- RLS: segue a convenção do projeto (acesso total a authenticated) — a escrita é
-- server-side (rota /api/nfce/emitir, sessão do usuário) e a leitura idem.

CREATE TABLE IF NOT EXISTS public.nfce_documentos (
    chave       text PRIMARY KEY,               -- chave de acesso (44 dígitos)
    xml_base64  text NOT NULL,                  -- XML autorizado, como o emissor devolve (Base64)
    criado_em   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nfce_documentos IS
    'XML autorizado (Base64) de cada NFC-e, keyed pela chave de acesso. Fonte p/ o download de XMLs da contabilidade.';

CREATE INDEX IF NOT EXISTS idx_nfce_documentos_criado_em ON public.nfce_documentos(criado_em);

ALTER TABLE public.nfce_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir acesso total a authenticated" ON public.nfce_documentos;
CREATE POLICY "Permitir acesso total a authenticated" ON public.nfce_documentos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
