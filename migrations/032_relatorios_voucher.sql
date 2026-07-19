-- Migration 032: adiciona a forma "voucher" aos relatórios
--
-- Contexto: a forma de pagamento VOUCHER (migration 031) entra no faturamento
-- total dos relatórios, mas ficava FORA da quebra por forma de pagamento:
--  - fn_metricas_vendas alimenta a barra "Composição de Receita por Forma de
--    Pagamento" — sem receita_voucher a barra soma menos que o total.
--  - fn_auditoria_caixa (auditoria por operador/dia) mostrava só
--    dinheiro/pix/cartão — vendas em voucher sumiam da conferência.
--
-- Ambas RETURNS TABLE mudam (nova coluna) => precisa DROP + CREATE (o
-- CREATE OR REPLACE não troca o tipo de retorno). Feito numa transação: DDL
-- é transacional no Postgres, então não há janela em que a função não exista.
--
-- Voucher NÃO afeta saldo_esperado da auditoria (não é dinheiro em espécie).

BEGIN;

-- ─────────────────────────────────────────────────────────
-- fn_metricas_vendas: + receita_voucher
-- ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_metricas_vendas(timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.fn_metricas_vendas(
    p_data_inicio timestamp with time zone DEFAULT (CURRENT_DATE - '30 days'::interval),
    p_data_fim timestamp with time zone DEFAULT now()
)
RETURNS TABLE(
    data date, total_faturado numeric, total_custo numeric, margem_bruta numeric,
    margem_pct numeric, ticket_medio numeric, qtd_vendas bigint, fat_anterior numeric,
    crescimento_pct numeric, receita_dinheiro numeric, receita_pix numeric,
    receita_debito numeric, receita_credito numeric, receita_voucher numeric
)
LANGUAGE sql
STABLE
AS $function$
    WITH vendas_periodo AS (
        SELECT
            DATE(p.created_at) AS dia,
            p.id AS pedido_id,
            p.total,
            p.forma_pagamento,
            p.created_at
        FROM public.pedidos p
        WHERE p.status = 'entregue'
          AND p.created_at >= p_data_inicio
          AND p.created_at <= p_data_fim
    ),
    itens_custo AS (
        SELECT
            DATE(vp.created_at) AS dia,
            SUM(ip.quantidade * COALESCE(pr.custo, 0)) AS custo_total
        FROM vendas_periodo vp
        JOIN public.itens_pedido ip ON ip.pedido_id = vp.pedido_id
        JOIN public.produtos pr ON pr.id = ip.produto_id
        GROUP BY DATE(vp.created_at)
    ),
    metricas_dia AS (
        SELECT
            vp.dia,
            SUM(vp.total)                          AS total_faturado,
            COALESCE(ic.custo_total, 0)             AS total_custo,
            SUM(vp.total) - COALESCE(ic.custo_total, 0) AS margem_bruta,
            CASE
                WHEN SUM(vp.total) > 0
                THEN ROUND(((SUM(vp.total) - COALESCE(ic.custo_total, 0)) / SUM(vp.total)) * 100, 2)
                ELSE 0
            END AS margem_pct,
            CASE
                WHEN COUNT(*) > 0
                THEN ROUND(SUM(vp.total) / COUNT(*), 2)
                ELSE 0
            END AS ticket_medio,
            COUNT(*)                                AS qtd_vendas,
            SUM(CASE WHEN vp.forma_pagamento = 'dinheiro' THEN vp.total ELSE 0 END) AS receita_dinheiro,
            SUM(CASE WHEN vp.forma_pagamento = 'pix'      THEN vp.total ELSE 0 END) AS receita_pix,
            SUM(CASE WHEN vp.forma_pagamento = 'debito'   THEN vp.total ELSE 0 END) AS receita_debito,
            SUM(CASE WHEN vp.forma_pagamento = 'credito'  THEN vp.total ELSE 0 END) AS receita_credito,
            SUM(CASE WHEN vp.forma_pagamento = 'voucher'  THEN vp.total ELSE 0 END) AS receita_voucher
        FROM vendas_periodo vp
        LEFT JOIN itens_custo ic ON ic.dia = vp.dia
        GROUP BY vp.dia, ic.custo_total
    )
    SELECT
        md.dia                           AS data,
        md.total_faturado,
        md.total_custo,
        md.margem_bruta,
        md.margem_pct,
        md.ticket_medio,
        md.qtd_vendas,
        COALESCE(LAG(md.total_faturado) OVER (ORDER BY md.dia), 0) AS fat_anterior,
        CASE
            WHEN COALESCE(LAG(md.total_faturado) OVER (ORDER BY md.dia), 0) > 0
            THEN ROUND(((md.total_faturado - LAG(md.total_faturado) OVER (ORDER BY md.dia))
                       / LAG(md.total_faturado) OVER (ORDER BY md.dia)) * 100, 2)
            ELSE 0
        END AS crescimento_pct,
        md.receita_dinheiro,
        md.receita_pix,
        md.receita_debito,
        md.receita_credito,
        md.receita_voucher
    FROM metricas_dia md
    ORDER BY md.dia;
$function$;

-- ─────────────────────────────────────────────────────────
-- fn_auditoria_caixa: + total_vendas_voucher
-- ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_auditoria_caixa(timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.fn_auditoria_caixa(
    p_data_inicio timestamp with time zone DEFAULT (CURRENT_DATE - '30 days'::interval),
    p_data_fim timestamp with time zone DEFAULT now()
)
RETURNS TABLE(
    data date, usuario_nome text, valor_abertura numeric, total_vendas_dinheiro numeric,
    total_vendas_pix numeric, total_vendas_cartao numeric, total_vendas_voucher numeric,
    total_sangrias numeric, total_reforcos numeric, saldo_esperado numeric,
    saldo_registrado numeric, diferenca numeric
)
LANGUAGE sql
STABLE
AS $function$
    WITH dias_caixa AS (
        SELECT DISTINCT
            DATE(c.created_at) AS dia,
            c.usuario_id
        FROM public.caixa c
        WHERE c.created_at >= p_data_inicio
          AND c.created_at <= p_data_fim
    ),
    aberturas AS (
        SELECT DISTINCT ON (DATE(c.created_at), c.usuario_id)
            DATE(c.created_at) AS dia,
            c.usuario_id,
            c.valor AS valor_abertura
        FROM public.caixa c
        WHERE c.tipo = 'abertura'
          AND c.created_at >= p_data_inicio
          AND c.created_at <= p_data_fim
        ORDER BY DATE(c.created_at), c.usuario_id, c.created_at DESC
    ),
    vendas_por_tipo AS (
        SELECT
            DATE(c.created_at) AS dia,
            c.usuario_id,
            SUM(CASE WHEN p.forma_pagamento = 'dinheiro' THEN c.valor ELSE 0 END) AS vendas_dinheiro,
            SUM(CASE WHEN p.forma_pagamento = 'pix'      THEN c.valor ELSE 0 END) AS vendas_pix,
            SUM(CASE WHEN p.forma_pagamento IN ('debito', 'credito') THEN c.valor ELSE 0 END) AS vendas_cartao,
            SUM(CASE WHEN p.forma_pagamento = 'voucher'  THEN c.valor ELSE 0 END) AS vendas_voucher
        FROM public.caixa c
        LEFT JOIN public.pedidos p ON p.id = c.pedido_id
        WHERE c.tipo = 'fechamento_conta'
          AND c.created_at >= p_data_inicio
          AND c.created_at <= p_data_fim
        GROUP BY DATE(c.created_at), c.usuario_id
    ),
    movimentacoes AS (
        SELECT
            DATE(c.created_at) AS dia,
            c.usuario_id,
            SUM(CASE WHEN c.tipo = 'sangria' THEN c.valor ELSE 0 END) AS total_sangrias,
            SUM(CASE WHEN c.tipo = 'reforco' THEN c.valor ELSE 0 END) AS total_reforcos
        FROM public.caixa c
        WHERE c.tipo IN ('sangria', 'reforco')
          AND c.created_at >= p_data_inicio
          AND c.created_at <= p_data_fim
        GROUP BY DATE(c.created_at), c.usuario_id
    ),
    ultimo_saldo AS (
        SELECT DISTINCT ON (DATE(c.created_at), c.usuario_id)
            DATE(c.created_at) AS dia,
            c.usuario_id,
            c.saldo AS saldo_registrado
        FROM public.caixa c
        WHERE c.created_at >= p_data_inicio
          AND c.created_at <= p_data_fim
        ORDER BY DATE(c.created_at), c.usuario_id, c.created_at DESC
    )
    SELECT
        dc.dia                                       AS data,
        u.nome                                       AS usuario_nome,
        COALESCE(a.valor_abertura, 0)                AS valor_abertura,
        COALESCE(vt.vendas_dinheiro, 0)              AS total_vendas_dinheiro,
        COALESCE(vt.vendas_pix, 0)                   AS total_vendas_pix,
        COALESCE(vt.vendas_cartao, 0)                AS total_vendas_cartao,
        COALESCE(vt.vendas_voucher, 0)               AS total_vendas_voucher,
        COALESCE(m.total_sangrias, 0)                AS total_sangrias,
        COALESCE(m.total_reforcos, 0)                AS total_reforcos,
        COALESCE(a.valor_abertura, 0)
            + COALESCE(vt.vendas_dinheiro, 0)
            + COALESCE(m.total_reforcos, 0)
            - COALESCE(m.total_sangrias, 0)          AS saldo_esperado,
        COALESCE(us.saldo_registrado, 0)             AS saldo_registrado,
        COALESCE(us.saldo_registrado, 0)
            - (COALESCE(a.valor_abertura, 0)
               + COALESCE(vt.vendas_dinheiro, 0)
               + COALESCE(m.total_reforcos, 0)
               - COALESCE(m.total_sangrias, 0))      AS diferenca
    FROM dias_caixa dc
    JOIN public.usuarios u ON u.id = dc.usuario_id
    LEFT JOIN aberturas a ON a.dia = dc.dia AND a.usuario_id = dc.usuario_id
    LEFT JOIN vendas_por_tipo vt ON vt.dia = dc.dia AND vt.usuario_id = dc.usuario_id
    LEFT JOIN movimentacoes m ON m.dia = dc.dia AND m.usuario_id = dc.usuario_id
    LEFT JOIN ultimo_saldo us ON us.dia = dc.dia AND us.usuario_id = dc.usuario_id
    ORDER BY dc.dia DESC, u.nome;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
