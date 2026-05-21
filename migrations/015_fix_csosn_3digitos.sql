-- Migration 015: Sanear CSOSN para 3 dígitos
--
-- Problema: a coluna produtos.csosn herdou um default documentado errado
-- na migration 012 ("0102"). CSOSN tem SEMPRE 3 dígitos (102, 103, 300,
-- 400, 500, 900 para NFC-e). O "0102" é, na verdade, Origem(0) + CSOSN(102)
-- que algumas telas concatenam — mas no payload da NFC-e os campos são
-- separados (Origem fica em produto, CSOSN fica em ICMS).
--
-- Esta migration:
-- 1) atualiza registros existentes que tenham 4 dígitos removendo o 1º;
-- 2) corrige o COMMENT da coluna.

UPDATE produtos
SET csosn = substring(csosn from 2)
WHERE csosn IS NOT NULL
  AND csosn ~ '^[0-9]{4}$';

COMMENT ON COLUMN produtos.csosn IS
'Código de Situação da Operação - Simples Nacional (3 dígitos). NFC-e aceita: 102, 103, 300, 400, 500, 900. Default emissão: 102.';
