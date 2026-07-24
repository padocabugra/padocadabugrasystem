import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'
import { parseChaveNFCe } from '@/lib/chave-nfce'

// Lê cookies (sessão) + monta um ZIP em memória → dinâmico, runtime Node.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/nfce/xmls?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
 *
 * Devolve um .zip com o XML autorizado de cada NFC-e emitida no período (um
 * arquivo <chave>.xml por nota) + um _indice.csv. É o pacote que a contabilidade
 * importa. Notas anteriores à captura do XML aparecem no índice como "ausente".
 */
export async function GET(req: Request) {
    try {
        const supabase = await createClient()

        // ── Auth: logado + admin/caixa ───────────────────────────────
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 })
        }
        const { data: usuario } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
        if (!usuario || !['admin', 'caixa'].includes(usuario.role)) {
            return NextResponse.json({ ok: false, erro: 'Permissão insuficiente.' }, { status: 403 })
        }

        // ── Período ──────────────────────────────────────────────────
        const { searchParams } = new URL(req.url)
        const inicio = searchParams.get('inicio') ?? ''
        const fim = searchParams.get('fim') ?? ''
        if (!DATA_RE.test(inicio) || !DATA_RE.test(fim)) {
            return NextResponse.json({ ok: false, erro: 'Período inválido (use inicio/fim YYYY-MM-DD).' }, { status: 400 })
        }

        // ── Notas emitidas no período (mesma convenção de fuso da tela) ──
        const { data: pedidos, error: pedErr } = await supabase
            .from('pedidos')
            .select('chave_nfce, total, created_at')
            .eq('nfce_status', 'emitida')
            .not('chave_nfce', 'is', null)
            .gte('created_at', `${inicio}T00:00:00-04:00`)
            .lte('created_at', `${fim}T23:59:59-04:00`)
            .order('created_at', { ascending: true })

        if (pedErr) {
            return NextResponse.json({ ok: false, erro: 'Erro ao consultar notas.' }, { status: 500 })
        }

        // Agrega por CHAVE: uma conta (vários pedidos) = uma nota = um XML.
        // valor da nota = soma dos pedidos da chave; data = a mais antiga.
        const porChave = new Map<string, { valor: number; data: string }>()
        for (const p of pedidos ?? []) {
            const k = p.chave_nfce as string
            if (!k) continue
            const val = Number(p.total) || 0
            const ex = porChave.get(k)
            if (ex) {
                ex.valor += val
                if (p.created_at < ex.data) ex.data = p.created_at
            } else {
                porChave.set(k, { valor: val, data: p.created_at })
            }
        }

        if (porChave.size === 0) {
            return NextResponse.json({ ok: false, erro: 'Nenhuma nota emitida no período.' }, { status: 404 })
        }

        // ── Busca os XMLs (em lotes, evita URL gigante no .in()) ──────
        const chaves = [...porChave.keys()]
        const xmlByChave = new Map<string, string>()
        for (let i = 0; i < chaves.length; i += 500) {
            const chunk = chaves.slice(i, i + 500)
            const { data: docs } = await supabase
                .from('nfce_documentos')
                .select('chave, xml_base64')
                .in('chave', chunk)
            for (const d of docs ?? []) xmlByChave.set(d.chave as string, d.xml_base64 as string)
        }

        // ── Monta o ZIP + índice ─────────────────────────────────────
        const zip = new JSZip()
        const linhas: string[][] = [['Chave', 'Numero', 'Serie', 'Data', 'Valor', 'XML']]
        let comXml = 0
        for (const [chave, info] of porChave) {
            const campos = parseChaveNFCe(chave)
            const numero = campos ? String(parseInt(campos.numero, 10)) : ''
            const serie = campos ? String(parseInt(campos.serie, 10)) : ''
            const dataBR = new Date(info.data).toLocaleDateString('pt-BR', { timeZone: 'America/Campo_Grande' })
            const xml = xmlByChave.get(chave)
            if (xml) {
                // jszip decodifica o base64 e grava o XML "cru" no arquivo.
                zip.file(`${chave}.xml`, xml, { base64: true })
                comXml++
            }
            linhas.push([chave, numero, serie, dataBR, info.valor.toFixed(2), xml ? 'sim' : 'ausente'])
        }
        const csv = '﻿' + linhas.map((r) => r.join(';')).join('\r\n')
        zip.file('_indice.csv', csv)

        const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
        const filename = `notas-xml-${inicio}-a-${fim}.zip`

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`,
                // Sinaliza quantas notas têm XML de fato (o client avisa se faltou).
                'X-Notas-Total': String(porChave.size),
                'X-Notas-Com-Xml': String(comXml),
            },
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno ao gerar os XMLs.'
        return NextResponse.json({ ok: false, erro: message }, { status: 500 })
    }
}
