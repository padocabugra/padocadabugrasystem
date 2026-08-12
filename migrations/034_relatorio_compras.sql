-- Migration 034: relatório de NOTAS DE COMPRA (entradas de estoque)
--
-- Contexto: a empresa precisa prestar contas das compras à contabilidade, mas
-- as entradas só existiam pulverizadas em movimentacao_estoque (uma linha por
-- PRODUTO) — o único acesso era o "Histórico" produto a produto. Esta função
-- consolida as linhas em NOTAS, que é a unidade que a contabilidade usa.
--
-- Decisões de agrupamento (validadas contra os dados reais em 2026-07-24):
--  • Chave = NÚMERO DA NF. Testei antes incluir o fornecedor na chave e os
--    dados reais mostraram que isso PARTE a mesma nota em duas: a NF 134573
--    tinha uma linha com o fornecedor em branco, e a NF 000645641 tinha um
--    ERRO DE DIGITAÇÃO ("DRD DRISTRIBUIDORA" vs "DRD DISTRIBUIDORA"). Num
--    relatório contábil, exibir uma nota como duas é pior do que o risco
--    remoto de dois fornecedores usarem o mesmo número — e esse risco fica
--    coberto pela coluna fornecedores_distintos (a tela sinaliza).
--  • Fornecedor exibido = mode() (grafia mais frequente do grupo), o que ainda
--    corrige o typo acima: prevalece a grafia usada na maioria das linhas.
--  • Entradas sem NF são agrupadas por fornecedor normalizado (minúsculas,
--    espaços colapsados, ponto final removido).
--  • Data da nota = MIN(data da compra): a mesma NF aparece lançada em dias
--    diferentes; a nota é um documento só, com uma data.
--  • Sem data_compra (23 linhas) cai em created_at convertido para o fuso da
--    empresa — nunca some do período.
--  • Entradas SEM número de NF são devolvidas com numero_nota_fiscal NULL
--    (agrupadas por fornecedor), para a tela avisar em vez de escondê-las.
--  • itens_sem_valor conta os itens lançados sem preço: o total da nota fica
--    subestimado nesses casos e a tela/PDF precisa sinalizar isso.
--
-- STABLE + sem SECURITY DEFINER: respeita o RLS de quem chama, como as demais
-- fn_ de relatório do projeto.

-- RETURNS TABLE muda => DROP + CREATE (CREATE OR REPLACE não troca o retorno).
DROP FUNCTION IF EXISTS public.fn_relatorio_compras(date, date);

CREATE FUNCTION public.fn_relatorio_compras(
    p_data_inicio date DEFAULT (CURRENT_DATE - 30),
    p_data_fim date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    data_compra date,
    numero_nota_fiscal text,
    fornecedor text,
    qtd_itens integer,
    itens_sem_valor integer,
    fornecedores_distintos integer,
    valor_total numeric
)
LANGUAGE sql
STABLE
AS $function$
    WITH entradas AS (
        SELECT
            COALESCE(
                m.data_compra,
                (m.created_at AT TIME ZONE 'America/Campo_Grande')::date
            )                                              AS dia,
            NULLIF(btrim(m.numero_nota_fiscal), '')        AS nf,
            NULLIF(btrim(m.fornecedor), '')                AS fornec_exibicao,
            -- chave de agrupamento do fornecedor (case/espaço/ponto-insensível)
            rtrim(
                lower(regexp_replace(btrim(COALESCE(m.fornecedor, '')), '\s+', ' ', 'g')),
                '.'
            )                                              AS fornec_key,
            m.valor_total
        FROM public.movimentacao_estoque m
        WHERE m.tipo = 'entrada'
          AND COALESCE(
                  m.data_compra,
                  (m.created_at AT TIME ZONE 'America/Campo_Grande')::date
              ) BETWEEN p_data_inicio AND p_data_fim
    )
    SELECT
        MIN(e.dia)                                                        AS data_compra,
        MIN(e.nf)                                                         AS numero_nota_fiscal,
        COALESCE(mode() WITHIN GROUP (ORDER BY e.fornec_exibicao), '')     AS fornecedor,
        COUNT(*)::integer                                                 AS qtd_itens,
        COUNT(*) FILTER (
            WHERE e.valor_total IS NULL OR e.valor_total = 0
        )::integer                                                        AS itens_sem_valor,
        COUNT(DISTINCT NULLIF(e.fornec_key, ''))::integer                 AS fornecedores_distintos,
        COALESCE(SUM(e.valor_total), 0)::numeric                          AS valor_total
    FROM entradas e
    -- Com NF: uma linha por NOTA. Sem NF: agrupa por fornecedor.
    GROUP BY (CASE WHEN e.nf IS NOT NULL THEN 'NF:' || e.nf ELSE 'SEM:' || e.fornec_key END)
    ORDER BY 1, 2;
$function$;

NOTIFY pgrst, 'reload schema';
