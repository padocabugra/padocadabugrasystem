// =============================================================
// Brasil NFe — emissão de NFC-e (Modelo 65)
//
// Server-side apenas: este módulo lê BRASIL_NFE_TOKEN do .env e
// não pode ser importado em client components.
//
// Schema do payload validado em conjunto com o suporte oficial
// da Brasil NFe (2026-05-21) — a doc pública em /products/nfc-e
// é incompleta e tem nomes de campo diferentes da API real.
//
// Contexto fiscal aplicado: BUGRA LTDA é Simples Nacional, mix de
// produção própria (pão, bolo) e revenda (bebidas). CFOP vem do
// cadastro do produto (5101 ou 5102). Sem IPI destacado (CST 99),
// PIS/COFINS sem incidência (CST 99). Sem transporte (cliente leva).
// IBPT ativado pra atender Lei da Transparência (Lei 12.741/2012).
// =============================================================

import { formatInTimeZone } from 'date-fns-tz'
import { distribuirDesconto, round2 } from './desconto'

const TIMEZONE = 'America/Campo_Grande'

export interface ItemNFCe {
    /** Código do produto (cProd). Pode ser SKU cadastrado ou id sanitizado como fallback. */
    codigo: string
    nome: string
    ncm?: string
    cfop?: number
    csosn?: string
    quantidade: number
    valorUnitario: number
    unidade?: string
}

// SEFAZ rejeita cProd com espaço, acento e caracteres especiais. Mantém somente
// alfanuméricos, hífen, underscore e ponto; colapsa repetidos; limita a 60 chars.
export function sanitizarCodigoProduto(input: string): string {
    const limpo = (input ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .toUpperCase()
        .slice(0, 60)
    return limpo || 'SEM-CODIGO'
}

// CSOSN que a emissão atual sabe montar com a nota válida. O grupo ICMS abaixo só
// carrega CodSituacaoTributaria + modalidadeBcIcms, que é suficiente apenas para o
// 102 (Simples Nacional, sem permissão de crédito). Os códigos de ST (201/202/203/
// 500) exigem CEST + campos de ICMS-ST que ainda não enviamos (ver feature
// feat/cest-wip → Rejeição 806); 300/400/900 ("Imune"/"Não tributada"/"Outros")
// exigem outros grupos e a SEFAZ rejeita como "CSOSN indevido". Adicionar um código
// aqui só DEPOIS que o payload souber montar o ICMS correspondente.
const CSOSN_SUPORTADOS = new Set(['102'])

// CSOSN tem 3 dígitos (102 = Simples sem permissão de crédito).
// Telas costumam mostrar "0102" = Origem(0) + CSOSN(102) concatenados;
// no payload os campos são separados. Qualquer código que a emissão ainda não
// sabe montar é coagido para 102 (com aviso no log), evitando que um cadastro
// errado da equipe derrube a nota com "CSOSN indevido" no balcão.
function normalizarCSOSN(input?: string | null): string {
    const digitos = (input ?? '').replace(/\D/g, '')
    const cod = digitos.length === 4 ? digitos.slice(1) : digitos.length === 3 ? digitos : '102'
    if (CSOSN_SUPORTADOS.has(cod)) return cod
    console.warn(`[brasilnfe] CSOSN ${cod} ainda não é suportado na emissão; usando 102. Ajuste o cadastro do produto.`)
    return '102'
}

// xProd: integradores rejeitam acentos. Normaliza pra ASCII puro.
function sanitizarNomeProduto(input: string): string {
    const limpo = (input ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^ -~]/g, '')
        .replace(/[<>&"]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120)
    return limpo || 'Produto'
}

// Data/hora atual no fuso da empresa, formato YYYY-MM-DDTHH:mm:ss (sem TZ).
// É o formato exigido pelo exemplo do suporte da Brasil NFe.
function dataEmissaoLocal(): string {
    return formatInTimeZone(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss")
}

// cNF (Codigo) na chave de acesso da SEFAZ: 8 dígitos numéricos.
// Deve ser único por nota emitida no mesmo dia/CNPJ. Random é seguro
// (1 em 100M de colisão; SEFAZ rejeita duplicado e a gente tenta de novo).
function gerarCodigoNumerico(): string {
    return Math.floor(Math.random() * 100_000_000).toString().padStart(8, '0')
}

export interface DadosNFCe {
    itens: ItemNFCe[]
    total: number
    formaPagamento: string
    cpfCliente?: string
    /** Desconto concedido (R$) sobre o total bruto dos itens. Default 0. */
    desconto?: number
    /** ID único do pedido para idempotência (IdentificadorInterno). */
    identificadorInterno?: string
}

export interface ResultadoNFCe {
    ok: boolean
    chaveAcesso?: string
    protocolo?: string
    danfeUrl?: string
    /** URL completa do QR-Code oficial da SEFAZ (com hash CSC), extraída do XML
     *  autorizado. É o único QR válido — a chave sozinha não permite remontar o
     *  hash sem o CSC do contribuinte. Cai em undefined se o XML não vier. */
    qrCodeUrl?: string
    /** URL de consulta por chave (<urlChave> do XML), p/ o rodapé do cupom. */
    urlChave?: string
    /** XML autorizado da NFC-e em Base64 (campo Base64Xml da resposta). É o
     *  documento fiscal que a contabilidade importa. Persistido pela rota de
     *  emissão em nfce_documentos. undefined se o emissor não devolver. */
    xmlBase64?: string
    erro?: string
}

// Desescapa as entidades XML básicas. &amp; por último pra não recompor errado.
function decodeXmlEntities(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
}

// Extrai o conteúdo textual de uma tag do XML, tolerando prefixo de namespace
// (<ns:tag>), atributos, e conteúdo em CDATA ou escapado.
function extrairTagXml(xml: string, tag: string): string | undefined {
    const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i')
    const m = xml.match(re)
    if (!m) return undefined
    const bruto = m[1].trim()
    const cdata = bruto.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/)
    const valor = cdata ? cdata[1] : decodeXmlEntities(bruto)
    const limpo = valor.trim()
    return limpo.length > 0 ? limpo : undefined
}

// O XML autorizado (procNFe) de toda NFC-e (modelo 65) carrega o grupo
// obrigatório <infNFeSupl> com o <qrCode> — a URL de consulta COMPLETA, já com
// o cHashQRCode (SHA-1 + CSC) calculado pelo integrador/SEFAZ. Esse é o único QR
// que a consulta pública valida; por isso extraímos daqui em vez de remontar a
// URL à mão (sem o CSC do contribuinte é impossível recalcular o hash).
export function extrairQrCodeNFCe(base64Xml?: string | null): { qrCodeUrl?: string; urlChave?: string } {
    if (!base64Xml) return {}
    try {
        const xml = Buffer.from(base64Xml, 'base64').toString('utf8')
        return {
            qrCodeUrl: extrairTagXml(xml, 'qrCode'),
            urlChave: extrairTagXml(xml, 'urlChave'),
        }
    } catch {
        return {}
    }
}

const FORMA_PAGAMENTO_MAP: Record<string, string> = {
    dinheiro: '01',
    credito: '03',
    debito: '04',
    pix: '17',
    // Voucher (cartão de benefício: Alelo/Sodexo/VR/Ticket…) declarado como
    // tPag 99 (Outros) por decisão do dono — a SEFAZ tem 10/11 pra vale
    // alimentação/refeição, mas aqui usamos o genérico.
    voucher: '99',
}

function mapearFormaPagamento(forma: string): string {
    return FORMA_PAGAMENTO_MAP[forma] ?? '99'
}

export async function emitirNFCe(dados: DadosNFCe): Promise<ResultadoNFCe> {
    const url = process.env.BRASIL_NFE_URL
    const token = process.env.BRASIL_NFE_TOKEN
    const ambiente = Number(process.env.BRASIL_NFE_AMBIENTE ?? '2')

    if (!url || !token) {
        return { ok: false, erro: 'Configuração da API Brasil NFe ausente (BRASIL_NFE_URL / BRASIL_NFE_TOKEN).' }
    }

    // IdentificadorInterno: único por tentativa. Combinar pedidoId + timestamp
    // garante que uma reemissão após falha não seja bloqueada como duplicada.
    const identificadorInterno = dados.identificadorInterno
        ? `${dados.identificadorInterno}-${Date.now()}`
        : `pdv-${Date.now()}`

    const dataHora = dataEmissaoLocal()

    // ─── Itens + rateio do desconto ─────────────────────────
    // Cada item leva ValorTotal bruto e a sua parcela do desconto (ValorDesconto).
    // VlPago = Σ bruto − Σ desconto, garantindo Σitens − Σdesc = total da nota
    // (a SEFAZ rejeita se o total do pagamento não bater com os itens). Quando o
    // desconto é 0, VlPago = Σ round2(item) = vNF — mantém o fix de troco 865/866
    // (item a item arredondado bate com o vNF que o integrador calcula).
    const itensCalc = dados.itens.map((item) => {
        const unidade = (item.unidade || 'UN').toUpperCase()
        const quantidade = Number(item.quantidade)
        const valorUnitario = Number(item.valorUnitario)
        const valorTotal = round2(quantidade * valorUnitario)
        return { item, unidade, quantidade, valorUnitario, valorTotal }
    })
    const valorBruto = round2(itensCalc.reduce((s, x) => s + x.valorTotal, 0))
    const descontoTotal = Math.min(Math.max(Number(dados.desconto) || 0, 0), valorBruto)
    const descontosItem = distribuirDesconto(descontoTotal, itensCalc.map((x) => x.valorTotal))
    const valorPago = round2(valorBruto - descontosItem.reduce((s, v) => s + v, 0))

    const payload = {
        // ─── Identificação ─────────────────────────────────
        TipoAmbiente: ambiente,
        ModeloDocumento: 65,
        Finalidade: 1,
        NaturezaOperacao: 'Venda ao Consumidor Final',
        ConsumidorFinal: true,
        IndicadorPresenca: 1,
        IndicadorIntermediador: false,
        CalcularIBPT: true,
        EnviarEmail: false,
        IdentificadorInterno: identificadorInterno,
        Codigo: gerarCodigoNumerico(),
        DataEmissao: dataHora,
        DataEntradaSaida: dataHora,

        // ─── Cliente ────────────────────────────────────────
        // NFC-e aceita null pra consumidor final sem CPF.
        // Quando o user informa CPF, vai como pessoa física (IndicadorIe=9).
        Cliente: dados.cpfCliente
            ? { CpfCnpj: dados.cpfCliente, IndicadorIe: 9 }
            : null,

        // ─── Produtos ───────────────────────────────────────
        Produtos: itensCalc.map(({ item, unidade, quantidade, valorUnitario, valorTotal }, i) => {
            return {
                CodProdutoServico: sanitizarCodigoProduto(item.codigo),
                NmProduto: sanitizarNomeProduto(item.nome),
                NCM: item.ncm || '21069090',
                CFOP: item.cfop || 5102,
                UnidadeComercial: unidade,
                Quantidade: quantidade,
                ValorUnitario: valorUnitario,
                ValorTotal: valorTotal,
                ValorDesconto: descontosItem[i],
                OrigemProduto: 0,
                Imposto: {
                    // Simples Nacional sem permissão de crédito (CSOSN 102),
                    // PIS/COFINS sem incidência (CST 99), IPI não destacado (CST 99).
                    // A API calcula valores automaticamente.
                    ICMS: {
                        CodSituacaoTributaria: normalizarCSOSN(item.csosn),
                        modalidadeBcIcms: 0,
                    },
                    IPI: {
                        CodEnquadramento: '999',
                        CodSituacaoTributaria: '99',
                        Aliquota: 0,
                    },
                    PIS: {
                        CodSituacaoTributaria: '99',
                        Aliquota: 0,
                    },
                    COFINS: {
                        CodSituacaoTributaria: '99',
                        Aliquota: 0,
                    },
                },
            }
        }),

        // ─── Pagamentos ─────────────────────────────────────
        Pagamentos: [
            {
                IndicadorPagamento: 0,
                Desconto: 0,
                FormaPagamento: mapearFormaPagamento(dados.formaPagamento),
                // VlPago = bruto − desconto rateado nos itens (= total líquido da
                // nota). Com desconto 0, equivale a Σ round2(itens) = vNF, mantendo
                // o fix de troco 865/866.
                VlPago: valorPago,
                VlTroco: 0,
                TipoIntegracao: false,
            },
        ],

        // ─── Transporte ─────────────────────────────────────
        // NFC-e é venda no balcão; cliente leva. ModalidadeFrete 9 = sem transporte.
        Transporte: { ModalidadeFrete: 9 },
    }

    try {
        const res = await fetch(`${url}/services/Fiscal/EnviarNotaFiscal`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Token: token,
            },
            body: JSON.stringify(payload),
        })

        const json: any = await res.json().catch(() => null)

        if (!res.ok) {
            const erro =
                json?.Error
                ?? json?.ReturnNF?.DsStatusRespostaSefaz
                ?? json?.Mensagem
                ?? json?.MotivoRejeicao
                ?? json?.erro
                ?? `HTTP ${res.status}`
            return { ok: false, erro: String(erro) }
        }

        const returnNF = json?.ReturnNF
        const isOk = returnNF?.Ok === true
        const chaveAcesso = returnNF?.ChaveNF
        const protocolo = returnNF?.CodStatusRespostaSefaz
            ? String(returnNF.CodStatusRespostaSefaz)
            : undefined

        if (!isOk || !chaveAcesso) {
            const motivo =
                json?.Error
                ?? returnNF?.DsStatusRespostaSefaz
                ?? json?.Mensagem
                ?? json?.MotivoRejeicao
                ?? 'Resposta sem autorização da SEFAZ'
            return { ok: false, erro: String(motivo) }
        }

        // QR-Code oficial: vem dentro do XML autorizado (Base64Xml → infNFeSupl).
        const base64Xml: string | undefined =
            typeof json?.Base64Xml === 'string' && json.Base64Xml.length > 0 ? json.Base64Xml : undefined
        const { qrCodeUrl, urlChave } = extrairQrCodeNFCe(base64Xml)

        // Guarda o XML autorizado (base64) pra contabilidade. A rota de emissão
        // persiste em nfce_documentos.
        return { ok: true, chaveAcesso, protocolo, qrCodeUrl, urlChave, xmlBase64: base64Xml }
    } catch (err: any) {
        return { ok: false, erro: err?.message ?? 'Erro desconhecido ao conectar com Brasil NFe' }
    }
}
