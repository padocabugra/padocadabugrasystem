-- =============================================
-- Migration: Garantir que registrar_producao funciona corretamente
-- Esta RPC debita insumos do estoque e adiciona o produto final
-- =============================================

CREATE OR REPLACE FUNCTION registrar_producao(
    p_receita_id UUID,
    p_quantidade_lotes NUMERIC DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_receita RECORD;
    v_ingrediente RECORD;
    v_insumo RECORD;
    v_necessario NUMERIC;
    v_produto_final_id UUID;
    v_producao_id UUID;
BEGIN
    -- 1. Busca a receita
    SELECT id, nome, ingredientes, produto_id
    INTO v_receita
    FROM receitas
    WHERE id = p_receita_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receita não encontrada: %', p_receita_id;
    END IF;

    v_produto_final_id := v_receita.produto_id;

    -- 2. Verifica e debita cada ingrediente
    FOR v_ingrediente IN
        SELECT * FROM jsonb_array_elements(v_receita.ingredientes) AS elem
    LOOP
        v_necessario := (v_ingrediente.elem->>'quantidade')::NUMERIC * p_quantidade_lotes;

        -- Busca estoque atual do insumo
        SELECT id, nome, estoque_atual
        INTO v_insumo
        FROM produtos
        WHERE id = (v_ingrediente.elem->>'produto_id')::UUID;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insumo não encontrado: %', v_ingrediente.elem->>'produto_id';
        END IF;

        IF v_insumo.estoque_atual < v_necessario THEN
            RAISE EXCEPTION 'Estoque insuficiente de "%". Necessário: %, Disponível: %',
                v_insumo.nome, v_necessario, v_insumo.estoque_atual;
        END IF;

        -- Debita estoque do insumo
        UPDATE produtos
        SET estoque_atual = estoque_atual - v_necessario,
            updated_at = NOW()
        WHERE id = v_insumo.id;
    END LOOP;

    -- 3. Incrementa estoque do produto final (se existir)
    IF v_produto_final_id IS NOT NULL THEN
        UPDATE produtos
        SET estoque_atual = estoque_atual + p_quantidade_lotes,
            updated_at = NOW()
        WHERE id = v_produto_final_id;
    END IF;

    -- 4. Registra na tabela de produções (se existir)
    BEGIN
        INSERT INTO producoes (receita_id, quantidade_lotes, produto_id)
        VALUES (p_receita_id, p_quantidade_lotes, v_produto_final_id)
        RETURNING id INTO v_producao_id;
    EXCEPTION
        WHEN undefined_table THEN
            -- Tabela producoes não existe, ignora (log-only)
            v_producao_id := NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'receita', v_receita.nome,
        'lotes', p_quantidade_lotes,
        'producao_id', v_producao_id
    );
END;
$$;
