# 🖨️ PLANO — Impressão de Nota de Pedido

**Criado em:** 2026-07-04  
**Status:** ✅ Alinhamento concluído — pronto para implementar  
**Contexto:** Alinhamento feito em conversa com o dono do projeto.

---

## 1. Resumo da Demanda

A Bugra possui **1 única impressora térmica** que hoje imprime o DANFE NFC-e (cupom fiscal).
A solicitação é:

1. **Pausar** a impressão do DANFE NFC-e na impressora (manter a emissão fiscal via API normalmente)
2. **Implementar** a impressão de uma **Nota de Pedido** nessa mesma impressora
3. A nota do pedido deve ser impressa no **momento do PAGAMENTO** (no Caixa ou Venda Rápida)

---

## 2. Decisões Alinhadas

| Ponto | Decisão |
|-------|---------|
| **Quando imprime** | No momento do **PAGAMENTO** (Caixa / Venda Rápida) |
| **Cabeçalho** | Nome da empresa + CNPJ (simplificado, sem IE/endereço) |
| **Itens** | Com preço unitário, quantidade e valor total |
| **Forma de pagamento** | ✅ Sim — sem troco |
| **Tipo do pedido** | ✅ Local / Delivery |
| **Destino** | ✅ Cozinha / Cafeteria / Caixa |
| **Mesa / Comanda** | ✅ Quando disponíveis |
| **Cliente** | ✅ Nome quando identificado |
| **Vendedor** | ❌ Não aparece na nota |
| **Observações** | ✅ Sim — **campo novo** (não existe ainda) |
| **ID do terminal** | ❌ Não |
| **Propósito** | Registro interno + comanda de produção + comprovante do cliente |
| **Impressão NFC-e** | Pausada via flag (código preservado) |
| **Fechamento de Caixa** | Continua imprimindo normalmente |

---

## 3. Layout da Nota de Pedido (80mm / 48 colunas)

> **Regra-chave:** É impressa **1 única nota por conta/cliente**, consolidando
> TODOS os pedidos feitos por aquele cliente (mesa/comanda) em uma **lista
> única de itens** (sem agrupar por pedido).

```
================================================
           PADOCA DA BUGRA
        CNPJ: XX.XXX.XXX/XXXX-XX
================================================
            NOTA DE PEDIDO
------------------------------------------------
Tipo: LOCAL          Destino: COZINHA
Mesa: 12             Comanda: 05
Cliente: João Silva
------------------------------------------------
ITEM                    QTDE   UNIT    TOTAL
------------------------------------------------
Pão Francês             10x    0,80     8,00
Café com Leite           2x    6,50    13,00
Bacon                 0,486kg 49,90    24,25
Bolo de Cenoura          1x   12,00    12,00
Suco Natural             1x    8,00     8,00
------------------------------------------------
TOTAL                              R$ 65,25
------------------------------------------------
Pagamento: PIX
------------------------------------------------
Obs: Sem cebola no bacon, café sem açúcar
------------------------------------------------
04/07/2026 14:25
================================================
```

### Notas sobre o layout:
- Cabeçalho centralizado, apenas nome + CNPJ
- Título "NOTA DE PEDIDO" (sem ID individual — é a conta inteira)
- Mesa/Comanda/Cliente só aparecem quando preenchidos
- Itens de **todos os pedidos da conta** em **lista única flat** (não agrupados)
- Unidade inteligente: `10x` para UN, `0,486kg` para KG
- Sem troco, sem dados fiscais, sem QR Code
- Observações consolidadas de todos os pedidos (quando preenchidas)
- Corte parcial no final

---

## 4. Infraestrutura Existente (Reutilizável)

Toda a infraestrutura de impressão térmica já está pronta:

| Componente | Arquivo | Status |
|-----------|---------|--------|
| Conexão WebUSB/Serial | `src/lib/thermal-printer.ts` | ✅ Pronto |
| Retry com reconexão | `src/components/shared/ThermalPrinterContext.tsx` | ✅ Pronto |
| `enviarBytes()` genérico | `thermal-printer.ts:L363-L388` | ✅ Pronto |
| Context Provider no dashboard | `src/app/dashboard/layout.tsx` | ✅ Pronto |
| Helpers `linhaLR()` / `formatBRL()` | `thermal-printer.ts` | ✅ Pronto |
| Encoder ESC/POS (lib) | `@point-of-sale/receipt-printer-encoder` | ✅ Instalada |

---

## 5. Plano de Implementação (6 etapas)

### ETAPA 1 — Campo de Observações (banco + formulário)

**Banco de dados:**
- Nova migration: adicionar coluna `observacoes TEXT` na tabela `pedidos`
- Alterar RPC `create_pedido_completo` para aceitar `p_observacoes`

**Frontend:**
- `NovoPedidoClient.tsx` — adicionar campo de texto "Observações" no formulário
- Passar `observacoes` na chamada RPC

**Arquivos afetados:**
- `migrations/0XX_observacoes_pedido.sql` (NOVO)
- `src/components/pedidos/NovoPedidoClient.tsx`
- `src/lib/types/pedidos.ts` — adicionar `observacoes?: string` na interface `Pedido`

---

### ETAPA 2 — Layout ESC/POS da Nota de Pedido

**Criar no `thermal-printer.ts`:**
- Interface `DadosImpressaoPedido` com os campos alinhados
- Função `montarPedidoEscPos()` — layout 80mm conforme seção 3
- Função exportada `imprimirPedido()`

**Arquivo afetado:**
- `src/lib/thermal-printer.ts`

---

### ETAPA 3 — Método no Context

**Adicionar ao `ThermalPrinterContext.tsx`:**
- Novo método `imprimirComprovantePedido()` na interface `PrinterCtx`
- Implementação com retry (seguindo o padrão de `imprimirComprovanteFechamento`)

**Arquivo afetado:**
- `src/components/shared/ThermalPrinterContext.tsx`

---

### ETAPA 4 — Integrar nos Fluxos de Pagamento

**CaixaClient.tsx:**
- Após pagamento, **consolidar todos os pedidos da conta** em um único `DadosImpressaoPedido`
- Juntar os itens de todos os pedidos em uma **lista única flat**
- Juntar observações de todos os pedidos (quando existirem)
- Chamar `imprimirComprovantePedido()` **uma única vez** para a conta inteira
- A chamada `imprimirCupomPedido()` (DANFE) é controlada pela flag da etapa 5

**VendaRapidaClient.tsx:**
- Após pagamento, chamar `imprimirComprovantePedido()` (1 pedido = 1 nota)
- A chamada `imprimirAuto()` (DANFE) é controlada pela flag da etapa 5

**Arquivos afetados:**
- `src/components/caixa/CaixaClient.tsx`
- `src/components/pdv/VendaRapidaClient.tsx`

---

### ETAPA 5 — Pausar Impressão NFC-e (Flag)

**Abordagem:** Variável de ambiente `NEXT_PUBLIC_IMPRIMIR_NFCE`

- Quando `false` → NFC-e é emitida normalmente na API, mas **não imprime** na térmica
- Quando `true` (ou ausente) → comportamento atual (imprime DANFE)
- Isso permite **reativar** a impressão NFC-e no futuro quando tiverem 2ª impressora

**Arquivos afetados:**
- `.env.local` / `.env.example` — adicionar `NEXT_PUBLIC_IMPRIMIR_NFCE=false`
- `src/components/caixa/CaixaClient.tsx` — condicional no `imprimirReciboAuto`
- `src/components/pdv/VendaRapidaClient.tsx` — condicional no `imprimirAuto`

---

### ETAPA 6 — Reimprimir Nota de Pedido

**Adicionar botão no `PedidoDetalheModal.tsx`:**
- "Reimprimir Nota do Pedido" — disponível para pedidos pagos
- Reconstrói os dados do pedido e chama `imprimirComprovantePedido()`
- Funciona de forma análoga ao "Reimprimir Cupom Fiscal" que já existe

**Arquivo afetado:**
- `src/components/pedidos/PedidoDetalheModal.tsx`

---

## 6. Pontos de Atenção

### ⚠️ Migration obrigatória antes do deploy
A etapa 1 (coluna `observacoes`) exige migration no banco de dados.
**Ordem: aplicar migration → depois push/deploy** (mesmo padrão da migration 025).

### ✅ 1 Nota por Conta/Cliente (DEFINIDO)
No Caixa, uma conta pode ter **vários pedidos** (ex: mesa fez 3 pedidos diferentes).
**Decisão:** Imprime **1 única nota consolidada** por conta, com todos os itens
de todos os pedidos em **lista única flat** (sem agrupar por pedido).
Isso evita múltiplas notas quando o cliente fez vários pedidos.

### ⚠️ Venda Rápida = 1 pedido
Na Venda Rápida, o fluxo é simplificado (1 pedido = 1 pagamento), então sempre imprime 1 nota.

### ⚠️ Impressão do Fechamento de Caixa continua
Nenhuma mudança no comprovante de fechamento — continua imprimindo normalmente.

### ⚠️ Código da NFC-e é PRESERVADO
O código de impressão do DANFE NFC-e **não é removido**, apenas desativado via flag.
Quando tiverem 2 impressoras, basta mudar `NEXT_PUBLIC_IMPRIMIR_NFCE=true`.

---

## 7. Arquivos Afetados (Resumo)

| Arquivo | Ação |
|---------|------|
| `migrations/0XX_observacoes_pedido.sql` | **NOVO** — coluna observacoes |
| `src/lib/thermal-printer.ts` | **EDITAR** — interface + layout + export |
| `src/lib/types/pedidos.ts` | **EDITAR** — campo observacoes na interface |
| `src/components/shared/ThermalPrinterContext.tsx` | **EDITAR** — novo método no context |
| `src/components/pedidos/NovoPedidoClient.tsx` | **EDITAR** — campo observações no form |
| `src/components/caixa/CaixaClient.tsx` | **EDITAR** — chamar nota de pedido + flag NFC-e |
| `src/components/pdv/VendaRapidaClient.tsx` | **EDITAR** — chamar nota de pedido + flag NFC-e |
| `src/components/pedidos/PedidoDetalheModal.tsx` | **EDITAR** — botão reimprimir nota pedido |
| `.env.local` / `.env.example` | **EDITAR** — flag NEXT_PUBLIC_IMPRIMIR_NFCE |

---

## 8. Ordem de Execução Recomendada

```
ETAPA 1 (Observações)  →  ETAPA 2 (Layout)  →  ETAPA 3 (Context)
                                                      ↓
                           ETAPA 6 (Reimprimir)  ←  ETAPA 4 (Integrar pagamento)
                                                      ↓
                                                 ETAPA 5 (Flag NFC-e)
```

1 → 2 → 3 → 4 → 5 → 6

A etapa 1 (migration) é pré-requisito de tudo. As etapas 2-3 são a fundação.
A etapa 4 é o coração. A etapa 5 é simples (flag). A etapa 6 é complementar.
