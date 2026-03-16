import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    )
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Atualiza a sessão — NUNCA faça outras lógicas antes disso
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname

    // Protege rotas autenticadas (/dashboard e /selecionar-ambiente)
    if ((pathname.startsWith('/dashboard') || pathname === '/selecionar-ambiente') && !user) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Redireciona usuário logado para /selecionar-ambiente se tentar acessar /login
    if (pathname === '/login' && user) {
        const url = request.nextUrl.clone()
        url.pathname = '/selecionar-ambiente'
        return NextResponse.redirect(url)
    }

    // RBAC: Controle de Acesso Baseado em Função
    if (pathname.startsWith('/dashboard') && user) {
        const { data: usuario } = await supabase
            .from('usuarios')
            .select('role')
            .eq('email', user.email!)
            .single()

        const role = usuario?.role

        // Se não for admin, aplica restrições estritas
        if (role !== 'admin') {
            // Ninguém além de admin acessa a raiz /dashboard (Painel Admin)
            if (pathname === '/dashboard') {
                return NextResponse.redirect(new URL('/selecionar-ambiente', request.url))
            }

            // Regras por papel
            if (role === 'vendedor' && !pathname.startsWith('/dashboard/pedidos')) {
                return NextResponse.redirect(new URL('/selecionar-ambiente', request.url))
            }

            const isCaixaPath = pathname.startsWith('/dashboard/pdv') || pathname.startsWith('/dashboard/caixa')
            if (role === 'caixa' && !isCaixaPath) {
                return NextResponse.redirect(new URL('/selecionar-ambiente', request.url))
            }

            if (role === 'cozinha' && !pathname.startsWith('/dashboard/cozinha')) {
                return NextResponse.redirect(new URL('/selecionar-ambiente', request.url))
            }
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        /*
         * Intercepta todas as rotas exceto:
         * - _next/static
         * - _next/image
         * - favicon.ico
         * - arquivos estáticos
         * - /cardapio (rota pública sem autenticação)
         */
        '/((?!_next/static|_next/image|favicon.ico|cardapio.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
