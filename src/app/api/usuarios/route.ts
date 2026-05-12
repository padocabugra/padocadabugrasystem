import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Roles válidas — qualquer outra será rejeitada
const ROLES_VALIDAS = new Set(['admin', 'caixa', 'vendedor', 'cozinha'])

export async function POST(req: Request) {
    try {
        // ── Autenticação ─────────────────────────────────────────────
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json(
                { erro: 'Não autorizado.' },
                { status: 401 }
            )
        }

        // ── Somente admin pode criar usuários ────────────────────────
        const { data: adminUser } = await supabase
            .from('usuarios')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!adminUser || adminUser.role !== 'admin') {
            return NextResponse.json(
                { erro: 'Apenas administradores podem criar funcionários.' },
                { status: 403 }
            )
        }

        // ── Validação de payload ─────────────────────────────────────
        const body = await req.json()
        const { nome, email, senha, role } = body ?? {}

        if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
            return NextResponse.json(
                { erro: 'Nome deve ter pelo menos 2 caracteres.' },
                { status: 400 }
            )
        }

        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return NextResponse.json(
                { erro: 'E-mail inválido.' },
                { status: 400 }
            )
        }

        if (!senha || typeof senha !== 'string' || senha.length < 6) {
            return NextResponse.json(
                { erro: 'Senha deve ter pelo menos 6 caracteres.' },
                { status: 400 }
            )
        }

        if (!role || !ROLES_VALIDAS.has(role)) {
            return NextResponse.json(
                { erro: 'Cargo inválido.' },
                { status: 400 }
            )
        }

        // ── Criação via Supabase Auth (server-side com session do admin) ──
        // Usamos o supabase server client que herda a sessão do admin logado.
        // O signUp cria o usuário na auth sem deslogar o admin pois é server-side.
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email.trim(),
            password: senha,
            options: {
                data: { nome: nome.trim(), role },
            },
        })

        if (authError) {
            const msg = authError.message?.includes('already registered')
                ? 'Este e-mail já está cadastrado.'
                : authError.message
            return NextResponse.json({ erro: msg }, { status: 422 })
        }

        if (!authData.user) {
            return NextResponse.json(
                { erro: 'Falha ao criar usuário na autenticação.' },
                { status: 500 }
            )
        }

        // ── Insere na tabela de usuários ─────────────────────────────
        const { error: dbError } = await supabase
            .from('usuarios')
            .insert({
                id: authData.user.id,
                email: email.trim().toLowerCase(),
                nome: nome.trim(),
                role,
                ativo: true,
            })

        if (dbError) {
            return NextResponse.json(
                { erro: 'Usuário criado na auth, mas falha ao inserir na tabela: ' + dbError.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            ok: true,
            usuario: {
                id: authData.user.id,
                email: email.trim(),
                nome: nome.trim(),
                role,
            },
        })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro interno.'
        return NextResponse.json({ erro: message }, { status: 500 })
    }
}
