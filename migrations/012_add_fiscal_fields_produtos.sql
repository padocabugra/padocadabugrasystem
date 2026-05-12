-- Migration 012: Adicionar campos fiscais (NCM, CFOP, CSOSN) na tabela produtos
-- Esses campos são opcionais e usam defaults na emissão de NFC-e se vazios

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ncm TEXT DEFAULT NULL;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS cfop TEXT DEFAULT NULL;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS csosn TEXT DEFAULT NULL;

-- Comentários para documentação
COMMENT ON COLUMN produtos.ncm IS 'Código NCM do produto (8 dígitos). Default emissão: 21069090';
COMMENT ON COLUMN produtos.cfop IS 'Código Fiscal da Operação. 5101=produção própria, 5102=revenda';
COMMENT ON COLUMN produtos.csosn IS 'Código de Situação da Operação - Simples Nacional. Default: 0102';
