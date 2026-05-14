-- =============================================
-- Migration 013: Sanear codigo (SKU) de produtos
-- =============================================
-- Contexto: a migration 003 criou o índice único parcial
-- idx_produtos_codigo_unique ON produtos(codigo) WHERE codigo IS NOT NULL.
-- Esse índice permite múltiplos NULLs, mas trata string vazia ('') como
-- valor real — então 2 produtos salvos sem SKU (codigo = '') quebram com
-- erro 23505 (duplicate key). Esta migration garante, no banco, que '' e
-- strings só com espaços sempre virem NULL, independentemente de quem
-- estiver fazendo o INSERT/UPDATE (frontend, RPC, import direto, etc.).

-- 1) Normaliza registros existentes que tenham codigo vazio ou só com espaços
UPDATE produtos
SET codigo = NULL
WHERE codigo IS NOT NULL
  AND btrim(codigo) = '';

-- 2) Trigger BEFORE INSERT/UPDATE que converte codigo vazio/só-espaços em NULL.
--    Defense in depth — protege contra qualquer cliente que esqueça de sanitizar.
CREATE OR REPLACE FUNCTION sanitize_produto_codigo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.codigo IS NOT NULL AND btrim(NEW.codigo) = '' THEN
        NEW.codigo := NULL;
    ELSIF NEW.codigo IS NOT NULL THEN
        NEW.codigo := btrim(NEW.codigo);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sanitize_produto_codigo ON produtos;
CREATE TRIGGER trg_sanitize_produto_codigo
BEFORE INSERT OR UPDATE OF codigo ON produtos
FOR EACH ROW
EXECUTE FUNCTION sanitize_produto_codigo();

COMMENT ON FUNCTION sanitize_produto_codigo() IS
'Converte produtos.codigo vazio/whitespace em NULL antes de gravar, evitando colisão no índice único parcial idx_produtos_codigo_unique.';
