-- Migration 035: DESPESAS / CUSTOS FIXOS da empresa
--
-- Contexto: a dona precisa lancar os custos do negocio (aluguel, energia, agua,
-- gas, impostos e o salario de CADA funcionario) para enxergar o resultado real
-- do mes — ate entao o sistema so media o que ENTRA (vendas) e o que foi
-- comprado (entradas de estoque), nunca o custo de operar.
--
-- Modelagem enxuta, de proposito:
--  • UMA tabela. Sem cadastro de categorias (categoria e um CHECK fechado + a
--    valvula 'outros'), sem cadastro de funcionarios, sem regras de recorrencia.
--    Cada linha e "uma conta de um mes".
--  • `competencia` = o MES a que a despesa pertence (sempre normalizada para o
--    dia 1 pelo trigger). E a chave da organizacao: a tela filtra por mes.
--    Separada de `vencimento` de proposito — a conta de luz de julho pode vencer
--    em agosto e ainda assim ser custo de julho.
--  • Salario por funcionario = uma linha categoria='funcionarios' com o nome na
--    descricao. Simples, e ja permite ver o custo de folha por pessoa.
--  • `pago` para ela saber o que ainda falta pagar no mes.
--
-- SEGURANCA: contem salarios. Alem do bloqueio de rota (middleware), o RLS aqui
-- e ADMIN-ONLY para leitura e escrita — espelha o padrao do audit_log (011).

CREATE TABLE IF NOT EXISTS public.despesas (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    competencia  date NOT NULL,
    categoria    text NOT NULL CHECK (categoria IN (
                     'aluguel','energia','agua','gas','funcionarios','impostos','outros'
                 )),
    descricao    text NOT NULL,
    valor        numeric(12,2) NOT NULL CHECK (valor >= 0),
    pago         boolean NOT NULL DEFAULT false,
    vencimento   date,
    observacao   text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.despesas IS
    'Custos fixos/operacionais por mes de competencia (aluguel, energia, folha, impostos...). Contem salarios: acesso restrito a admin.';
COMMENT ON COLUMN public.despesas.competencia IS
    'Mes a que a despesa pertence, sempre no dia 1 (normalizado por trigger). Diferente de vencimento.';

CREATE INDEX IF NOT EXISTS idx_despesas_competencia ON public.despesas (competencia DESC);
CREATE INDEX IF NOT EXISTS idx_despesas_categoria   ON public.despesas (categoria);

-- Normaliza a competencia para o dia 1 e mantem updated_at — assim a tela nunca
-- precisa se preocupar com o dia informado.
CREATE OR REPLACE FUNCTION public.fn_despesas_normaliza()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.competencia := date_trunc('month', NEW.competencia)::date;
    NEW.updated_at  := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_despesas_normaliza ON public.despesas;
CREATE TRIGGER trg_despesas_normaliza
    BEFORE INSERT OR UPDATE ON public.despesas
    FOR EACH ROW EXECUTE FUNCTION public.fn_despesas_normaliza();

-- ── RLS: somente admin (dados sensiveis: salarios) ──────────────────
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_despesas" ON public.despesas;
CREATE POLICY "admin_all_despesas" ON public.despesas
    FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.role = 'admin')
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.role = 'admin')
    );

NOTIFY pgrst, 'reload schema';
