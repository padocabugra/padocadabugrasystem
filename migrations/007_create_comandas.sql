-- =============================================
-- Migration 007: Sistema de Comandas
-- Tabela, coluna em pedidos, RPC atualizada e funções admin
-- =============================================

-- 1. Criar tipo enum para status da comanda
DO $$ BEGIN
    CREATE TYPE comanda_status_enum AS ENUM ('livre', 'ocupada', 'bloqueada');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Criar tabela comandas
CREATE TABLE IF NOT EXISTS public.comandas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    numero INTEGER NOT NULL UNIQUE,
    status comanda_status_enum NOT NULL DEFAULT 'livre',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.comandas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso total a authenticated" ON public.comandas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Adicionar coluna comanda_id na tabela pedidos
ALTER TABLE public.pedidos
    ADD COLUMN IF NOT EXISTS comanda_id UUID REFERENCES public.comandas(id) ON DELETE SET NULL;

-- 4. Seed: criar comandas 1-50 (ajuste conforme necessidade)
INSERT INTO public.comandas (numero, status)
SELECT n, 'livre'
FROM generate_series(1, 50) AS n
ON CONFLICT (numero) DO NOTHING;

-- 5. Atualizar RPC create_pedido_completo para aceitar p_comanda_id
CREATE OR REPLACE FUNCTION create_pedido_completo(
    p_cliente_id UUID DEFAULT NULL,
    p_numero_mesa INTEGER DEFAULT NULL,
    p_vendedor_id UUID DEFAULT NULL,
    p_total NUMERIC DEFAULT 0,
    p_tipo_pedido tipo_pedido_enum DEFAULT 'local',
    p_itens JSONB DEFAULT '[]'::jsonb,
    p_comanda_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido_id UUID;
    v_item JSONB;
BEGIN
    -- Se uma comanda foi informada, marca como ocupada
    IF p_comanda_id IS NOT NULL THEN
        UPDATE comandas SET status = 'ocupada', updated_at = NOW()
        WHERE id = p_comanda_id AND status = 'livre';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Comanda não está disponível (já ocupada ou bloqueada).';
        END IF;
    END IF;

    -- 1. Cria o pedido
    INSERT INTO pedidos (
        cliente_id,
        numero_mesa,
        vendedor_id,
        total,
        tipo_pedido,
        comanda_id,
        status
    ) VALUES (
        p_cliente_id,
        p_numero_mesa,
        p_vendedor_id,
        p_total,
        p_tipo_pedido,
        p_comanda_id,
        'pendente'
    )
    RETURNING id INTO v_pedido_id;

    -- 2. Insere os itens do pedido
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
        INSERT INTO itens_pedido (
            pedido_id,
            produto_id,
            quantidade,
            preco_unitario
        ) VALUES (
            v_pedido_id,
            (v_item->>'produto_id')::UUID,
            (v_item->>'quantidade')::NUMERIC,
            (v_item->>'preco_unitario')::NUMERIC
        );
    END LOOP;

    RETURN jsonb_build_object('pedido_id', v_pedido_id);
END;
$$;

-- 6. Função: Resetar uma comanda específica (libera)
CREATE OR REPLACE FUNCTION fn_resetar_comanda(p_numero INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE comandas SET status = 'livre', updated_at = NOW()
    WHERE numero = p_numero;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda % não encontrada.', p_numero;
    END IF;
END;
$$;

-- 7. Função: Bloquear uma comanda
CREATE OR REPLACE FUNCTION fn_bloquear_comanda(p_numero INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE comandas SET status = 'bloqueada', updated_at = NOW()
    WHERE numero = p_numero;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comanda % não encontrada.', p_numero;
    END IF;
END;
$$;

-- 8. Função: Reset geral (fim do dia) — libera todas que não estão bloqueadas
CREATE OR REPLACE FUNCTION fn_resetar_todas_comandas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE comandas SET status = 'livre', updated_at = NOW()
    WHERE status = 'ocupada';
END;
$$;
