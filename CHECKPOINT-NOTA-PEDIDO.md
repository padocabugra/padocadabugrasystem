# 🖨️ CHECKPOINT — Impressão de Nota de Pedido (retomar aqui)

**Data:** 2026-07-04
**Origem da demanda:** `NOTA-PEDIDO-PLAN.md` (raiz do projeto) — validado contra o código real, está CORRETO (~95%).
**Autorização do dono:** implementar tudo, testar, **commit + push na main** (fluxo normal). Eu aplico migrations no Supabase.

## Objetivo
A ÚNICA impressora térmica hoje imprime o DANFE NFC-e. Trocar isso para:
1. **Pausar** a impressão do DANFE na térmica (NFC-e continua sendo emitida via API) — via flag `NEXT_PUBLIC_IMPRIMIR_NFCE=false`.
2. **Imprimir uma Nota de Pedido** (comanda de produção + comprovante) na mesma impressora, **no momento do PAGAMENTO** (Caixa e Venda Rápida).
3. Campo novo de **observações** no pedido.
4. Botão de **reimprimir Nota de Pedido** no `PedidoDetalheModal`.

## ✅ JÁ FEITO nesta sessão
- **Validação completa** do plano contra os 8 arquivos reais (tudo confere).
- **Migration `migrations/030_observacoes_pedido.sql` CRIADA e APLICADA no Supabase** (verificado):
  - Coluna `pedidos.observacoes TEXT` criada.
  - RPC `create_pedido_completo` recriado com 10º arg `p_observacoes text DEFAULT NULL`, **preservando `SECURITY DEFINER` + `SET search_path TO 'public','pg_temp'`** (hardening da migr. 023) e TODA a lógica de destino/comanda (migr. 019/021). Grava `NULLIF(TRIM(p_observacoes),'')`.
  - Assinatura viva confirmada: `create_pedido_completo(uuid,integer,uuid,numeric,tipo_pedido_enum,jsonb,uuid,boolean,boolean,text)` com `proconfig=[search_path=public, pg_temp]`.
- **Conexão DB** (transaction pooler): `postgresql://postgres.jvanoewgyefobqlsyxxw:padocabugra123@aws-1-us-east-1.pooler.supabase.com:6543/postgres`. Rodar scripts `pg` de DENTRO do projeto (node_modules tem `pg`). Criar `_tmp_*.cjs` no projeto, rodar `cd projeto && node _tmp_x.cjs`, depois `rm -f`.

## ⏳ PENDENTE (ordem sugerida 2→3→types→NovoPedido→Caixa→VendaRapida→Modal→env)

### DECISÕES DE DESIGN (imutáveis — já pensadas)
- **Nota de Pedido NÃO depende da NFC-e** → imprimir **imperativamente no pagamento** (não via useEffect reativo). Evita a cascata de re-render (lição commit 39349fd). O DANFE continua no useEffect existente, mas **gated pela flag**.
- **Caixa consolida 1 nota por conta**: `itensConta = pedidosPagos.flatMap(p => p.itens_pedido)` já existe em `handleFinalizarVenda`. Reusar. Tipo/destino/obs = do 1º pedido pago; obs = juntar de todos.
- **Venda Rápida** = 1 pedido, sempre Tipo=LOCAL, Destino=CAIXA, sem mesa/comanda/cliente/obs. NÃO precisa da migration.
- Flag: `NEXT_PUBLIC_IMPRIMIR_NFCE` — ausente ou `'true'` = imprime DANFE (atual); `'false'` = pausa DANFE, imprime só a Nota. Ler via `process.env.NEXT_PUBLIC_IMPRIMIR_NFCE !== 'false'`.
- Layout ESC/POS 48 colunas, item em 2 linhas (nome; depois `  {qtd} x {unit}` à esq + subtotal à dir). qtd: un = `10x`, kg = `0,486kg`. Usar helpers existentes `formatBRL`/`linhaLR` (privados no módulo — a função nova fica no MESMO arquivo).

---

### ETAPA 2 — `src/lib/thermal-printer.ts`
Adicionar (após `DadosImpressaoFechamento`) a interface e, junto às funções `montar*`/`imprimir*`, o montador e o export. Colar exatamente:

```ts
// Dados pra NOTA DE PEDIDO (comanda de produção + comprovante do cliente).
// Não é documento fiscal. Impressa na térmica no momento do pagamento.
export interface DadosImpressaoPedido {
    razaoSocial: string
    cnpj: string
    tipoPedido?: string          // 'LOCAL' | 'DELIVERY'
    destino?: string             // 'COZINHA' | 'CAFETERIA' | 'CAIXA'
    numeroMesa?: number | null
    comandaNumero?: number | null
    clienteNome?: string | null
    itens: Array<{
        quantidade: number
        precoUnitario: number
        subtotal: number
        nome: string
        unidadeMedida?: string | null
    }>
    total: number
    formaPagamentoLabel?: string
    observacoes?: string | null
    dataHora: string
}

// Formata a quantidade do item: '10x' pra unidade, '0,486kg' pra peso.
function formatQtdPedido(q: number, unidade?: string | null): string {
    const un = (unidade ?? '').toLowerCase()
    if (un === 'kg') return `${q.toFixed(3).replace('.', ',')}kg`
    return `${Number.isInteger(q) ? q : q.toFixed(3).replace('.', ',')}x`
}

// Quebra texto em linhas de no máximo `cols` chars. Pra observações longas.
function wrapTexto(texto: string, cols = 46): string[] {
    const palavras = texto.split(/\s+/)
    const linhas: string[] = []
    let atual = ''
    for (const p of palavras) {
        if ((atual + (atual ? ' ' : '') + p).length > cols) {
            if (atual) linhas.push(atual)
            atual = p.length > cols ? p.slice(0, cols) : p
        } else {
            atual = atual ? `${atual} ${p}` : p
        }
    }
    if (atual) linhas.push(atual)
    return linhas
}

// Bytes ESC/POS da NOTA DE PEDIDO em 80mm (48 colunas).
function montarPedidoEscPos(dados: DadosImpressaoPedido): Uint8Array {
    const enc = new ReceiptPrinterEncoder({
        language: 'esc-pos', columns: 48, feedBeforeCut: 3, newline: '\n',
    })
    const sep = '-'.repeat(48)
    const sepForte = '='.repeat(48)

    enc.initialize().align('center').line(sepForte).bold(true).line(dados.razaoSocial).bold(false)
    if (dados.cnpj) enc.size('small').line(`CNPJ: ${dados.cnpj}`).size('normal')
    enc.line(sepForte).bold(true).line('NOTA DE PEDIDO').bold(false).line(sep).align('left')

    const tipo = dados.tipoPedido ? dados.tipoPedido.toUpperCase() : null
    const destino = dados.destino ? dados.destino.toUpperCase() : null
    if (tipo || destino) {
        enc.line(linhaLR(tipo ? `Tipo: ${tipo}` : '', destino ? `Destino: ${destino}` : ''))
    }
    if (dados.numeroMesa != null || dados.comandaNumero != null) {
        enc.line(linhaLR(
            dados.numeroMesa != null ? `Mesa: ${dados.numeroMesa}` : '',
            dados.comandaNumero != null ? `Comanda: ${dados.comandaNumero}` : '',
        ))
    }
    if (dados.clienteNome) enc.line(`Cliente: ${dados.clienteNome}`.slice(0, 48))

    enc.line(sep)
    dados.itens.forEach((item) => {
        enc.line(item.nome.slice(0, 48))
        const esq = `  ${formatQtdPedido(item.quantidade, item.unidadeMedida)} x ${formatBRL(item.precoUnitario)}`
        enc.line(linhaLR(esq, formatBRL(item.subtotal)))
    })
    enc.line(sep)
    enc.bold(true).line(linhaLR('TOTAL', `R$ ${formatBRL(dados.total)}`)).bold(false)

    if (dados.formaPagamentoLabel) {
        enc.line(sep).line(`Pagamento: ${dados.formaPagamentoLabel}`)
    }
    if (dados.observacoes && dados.observacoes.trim()) {
        enc.line(sep)
        wrapTexto(`Obs: ${dados.observacoes.trim()}`, 48).forEach((l) => enc.line(l))
    }
    enc.line(sep).align('center').size('small').line(dados.dataHora).size('normal')
        .line(sepForte).newline().newline().cut('partial')

    return enc.encode()
}

// Imprime a NOTA DE PEDIDO. Throw se falhar.
export async function imprimirPedido(impressora: ImpressoraPareada, dados: DadosImpressaoPedido): Promise<void> {
    await enviarBytes(impressora, montarPedidoEscPos(dados))
}
```

### ETAPA 3 — `src/components/shared/ThermalPrinterContext.tsx`
1. Import de `@/lib/thermal-printer`: adicionar `imprimirPedido,` e `type DadosImpressaoPedido,`.
2. Interface `PrinterCtx`: adicionar
   ```ts
   /** Imprime a Nota de Pedido (comanda/comprovante não-fiscal). Toast em erro. */
   imprimirComprovantePedido: (dados: DadosImpressaoPedido) => Promise<boolean>
   ```
3. Implementar (espelhar `imprimirComprovanteFechamento`, ~L165-183):
   ```ts
   const imprimirComprovantePedido = useCallback(async (dados: DadosImpressaoPedido): Promise<boolean> => {
       let alvo = impressora ?? await obterImpressoraPareada().catch(() => null)
       if (alvo && !impressora) setImpressora(alvo)
       if (!alvo) {
           toast.warning('Impressora nao configurada', {
               description: 'Pedido pago, mas a nota nao foi impressa. Conecte a impressora no PDV.',
           })
           return false
       }
       try {
           await enviarComRetry(alvo, (a) => imprimirPedido(a, dados))
           return true
       } catch (err: any) {
           toast.error('Falha ao imprimir a nota do pedido', {
               description: err?.message ?? 'Verifique papel, conexao e tente novamente.',
           })
           return false
       }
   }, [impressora, enviarComRetry])
   ```
4. Adicionar `imprimirComprovantePedido,` no `value={{...}}` do Provider (~L194) E no fallback do `useThermalPrinter` (~L205-214): `imprimirComprovantePedido: async () => false,`.

### ETAPA (types) — `src/lib/types/pedidos.ts`
Na interface `Pedido` adicionar: `observacoes?: string | null` (perto de `desconto?`).

### ETAPA 1b — `src/components/pedidos/NovoPedidoClient.tsx`
1. Estado: `const [observacoes, setObservacoes] = useState('')` (perto de `numeroMesa`).
2. No `handleSubmit`, na chamada `create_pedido_completo`, adicionar após `p_destino_cafeteria`: `p_observacoes: observacoes.trim() || null,`.
3. No reset (fim do handleSubmit): `setObservacoes('')`.
4. UI: seção com `<textarea>` (após a Seção 3 Mesa, antes do Catálogo):
   ```tsx
   <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-sm">
       <p className="text-sm font-semibold text-gray-700 mb-2">Observações <span className="text-gray-400 font-normal">(opcional)</span></p>
       <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2}
           placeholder="Ex: sem cebola, café sem açúcar..."
           className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-100" />
   </div>
   ```

### ETAPA 4a + 5 — `src/components/caixa/CaixaClient.tsx`
- **Flag** (topo, após imports): `const IMPRIMIR_NFCE = process.env.NEXT_PUBLIC_IMPRIMIR_NFCE !== 'false'`
- **SELECT** em `carregarPedidosProntos` (~L408): adicionar `tipo_pedido, destino_cozinha, destino_cafeteria, observacoes` nas colunas de `pedidos`.
- **Interface `PedidoPDV`** (~L43): adicionar `tipo_pedido?: string; destino_cozinha?: boolean; destino_cafeteria?: boolean; observacoes?: string | null`.
- **`normalizarPedido`** (~L94): mapear `tipo_pedido: p.tipo_pedido, destino_cozinha: p.destino_cozinha, destino_cafeteria: p.destino_cafeteria, observacoes: p.observacoes ?? null`.
- **Callback `imprimirNotaConta`** (perto de `imprimirCupomPedido`):
  ```ts
  const imprimirNotaConta = useCallback(async (
      conta: { label: string; clienteNome: string | null; comandaNumero: number | null; numeroMesa: number | null; pedidos: PedidoPDV[] },
      itens: ItemPedidoPDV[], total: number, forma: FormaPagamento, dataHora: string,
  ): Promise<boolean> => {
      const p0 = conta.pedidos[0]
      const destino = p0?.destino_cozinha ? 'COZINHA' : p0?.destino_cafeteria ? 'CAFETERIA' : 'CAIXA'
      const obs = conta.pedidos.map((p) => p.observacoes).filter(Boolean).join(' | ') || null
      return impressora.imprimirComprovantePedido({
          razaoSocial: process.env.NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL || 'BUGRA LTDA',
          cnpj: process.env.NEXT_PUBLIC_EMPRESA_CNPJ || '',
          tipoPedido: (p0?.tipo_pedido || 'local'), destino,
          numeroMesa: conta.numeroMesa, comandaNumero: conta.comandaNumero, clienteNome: conta.clienteNome,
          itens: itens.map((i) => ({ quantidade: i.quantidade, precoUnitario: i.preco_unitario, subtotal: i.subtotal, nome: i.produto?.nome ?? 'Produto', unidadeMedida: i.produto?.unidade_medida ?? null })),
          total, formaPagamentoLabel: FORMA_LABEL[forma], observacoes: obs, dataHora,
      })
  }, [impressora])
  ```
- **Chamar no `handleFinalizarVenda`**, após `setReciboAtual(recibo)`, se `imprimir`:
  ```ts
  if (imprimir) {
      void imprimirNotaConta(
          { label: contaSelecionada.label, clienteNome: contaSelecionada.clienteNome, comandaNumero: contaSelecionada.comandaNumero, numeroMesa: contaSelecionada.numeroMesa, pedidos: pedidosPagos },
          itensConta, liquidoPago, formaNota, recibo.dataHora,
      ).then((ok) => setStatusImpressao(ok ? 'ok' : 'falha'))
  }
  ```
- **Gate do DANFE no useEffect** (~L467-483): após `if (!reciboAtual.imprimir) {...}`, inserir:
  ```ts
  if (!IMPRIMIR_NFCE) { autoPrintReciboRef.current = reciboAtual; return }  // NFC-e pausada
  ```
  ⚠️ NÃO resetar `statusImpressao` nesse caminho.
- Reimpressão manual (`reimprimirReciboManual`): opcional adaptar p/ nota quando flag off; se faltar tempo, deixar (reimpressão fica no PedidoDetalheModal).

### ETAPA 4b + 5 — `src/components/pdv/VendaRapidaClient.tsx`
- **Flag**: `const IMPRIMIR_NFCE = process.env.NEXT_PUBLIC_IMPRIMIR_NFCE !== 'false'` (topo).
- **Impressão da nota** em `handleFinalizar` (~após `setRecibo({...})`), se `imprimir`:
  ```ts
  if (imprimir) {
      void impressora.imprimirComprovantePedido({
          razaoSocial: process.env.NEXT_PUBLIC_EMPRESA_RAZAO_SOCIAL || 'BUGRA LTDA',
          cnpj: process.env.NEXT_PUBLIC_EMPRESA_CNPJ || '',
          tipoPedido: 'LOCAL', destino: 'CAIXA',
          itens: itensSnapshot.map((i) => ({ quantidade: i.quantidade, precoUnitario: i.preco, subtotal: i.preco * i.quantidade, nome: i.nome, unidadeMedida: i.unidade_medida ?? null })),
          total: liquidoSnapshot, formaPagamentoLabel: FORMA_LABEL[formaSnapshot],
          dataHora: dataHoraLocalVisual(getAgoraUTC()),
      })
  }
  ```
- **Gate do DANFE no useEffect** (~L328-335): trocar para
  ```ts
  if (IMPRIMIR_NFCE && recibo.imprimir && recibo.nfce?.ok && recibo.nfce.chaveAcesso) { void imprimirAuto(recibo) }
  ```

### ETAPA 6 — `src/components/pedidos/PedidoDetalheModal.tsx`
- **SELECT** em `carregar()` (~L70): adicionar `observacoes, destino_cozinha, destino_cafeteria` às colunas de `pedidos`.
- **Estado**: `const [reimprimindoNota, setReimprimindoNota] = useState(false)`.
- **Função `reimprimirNotaPedido`** (espelhar `reimprimirCupom` L219): montar `DadosImpressaoPedido` de `pedido`+`itens` (destino = `pedido.destino_cozinha ? 'COZINHA' : pedido.destino_cafeteria ? 'CAFETERIA' : 'CAIXA'`; tipoPedido `pedido.tipo_pedido`; mesa `pedido.numero_mesa`; comanda `comandaNumero`; cliente `clienteNome`; obs `pedido.observacoes`; forma via `FORMA_PAGAMENTO_LABEL`; itens com `unidadeMedida: i.unidade_medida`). Chamar `impressora.imprimirComprovantePedido(...)`.
- **Botão** no rodapé (perto de "Reimprimir Cupom Fiscal", ~L412), quando `!editMode && pedido`:
  ```tsx
  <button onClick={reimprimirNotaPedido} disabled={reimprimindoNota}
      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50">
      {reimprimindoNota ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
      Reimprimir Nota do Pedido
  </button>
  ```

### ETAPA 5 — `.env.local` e `.env.example`
Adicionar: `NEXT_PUBLIC_IMPRIMIR_NFCE=false`
⚠️ Também setar na **Vercel** (produção) `NEXT_PUBLIC_IMPRIMIR_NFCE=false` — senão em prod continua imprimindo o DANFE. Avisar o dono.

## PASSOS FINAIS (obrigatórios)
1. `npm run build` — corrigir erros de tipo.
2. `npm test` (vitest) — testes devem passar; ajustar se algum tocar `thermal-printer`/RPC.
3. Teste manual: pedido com observações → pagar no Caixa → validar que a Nota sai e o DANFE NÃO sai (flag off).
4. `git add -A && git commit` (+ `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`) e **`git push` na main** (autorizado).
5. Apagar `NOTA-PEDIDO-PLAN.md` e este checkpoint quando concluído (ou marcar done). Atualizar memória se marco macro.

## Arquivos de referência já lidos (não precisa reler tudo)
- `thermal-printer.ts`: `enviarBytes` L363-388, `formatBRL` L271, `linhaLR` L277 (privados). Encoder 48 col.
- `ThermalPrinterContext.tsx`: `imprimirComprovanteFechamento` L165-183, fallback L205-214.
- `CaixaClient.tsx`: `handleFinalizarVenda` L658-806 (itensConta L716, liquidoPago L719, recibo L750-763), useEffect auto-print L467-483, SELECT L406-418, `imprimirCupomPedido` L266-296, `reimprimirReciboManual` L486-491.
- `VendaRapidaClient.tsx`: `handleFinalizar` L434-505, `imprimirAuto` L107-132, useEffect L328-335.
- `PedidoDetalheModal.tsx`: `carregar` SELECT L69-82, `reimprimirCupom` L219-259, rodapé L409-418.
- `NovoPedidoClient.tsx`: `handleSubmit` RPC L239-253, reset L272-281.
