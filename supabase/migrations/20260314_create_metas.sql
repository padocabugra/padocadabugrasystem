CREATE TABLE IF NOT EXISTS public.metas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_meta TEXT NOT NULL, -- 'faturamento' ou 'vendas'
  valor_meta NUMERIC(10,2) NOT NULL,
  mes_referencia INT NOT NULL,
  ano_referencia INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso total a admin" ON public.metas 
  FOR ALL TO authenticated 
  USING (true);

CREATE POLICY "Permitir leitura para anon (se via app)" ON public.metas
  FOR SELECT TO anon
  USING (true);

-- Adicionar algumas metas padrao para teste
INSERT INTO public.metas (tipo_meta, valor_meta, mes_referencia, ano_referencia)
VALUES ('faturamento', 50000.00, 3, 2026), ('vendas', 2000, 3, 2026);
