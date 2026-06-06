import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { NAV_ITEMS } from '@/lib/types'

// A guarda de rota espelha EXATAMENTE o menu (NAV_ITEMS): se o cargo vê o item
// no menu, pode acessar a rota (e suas sub-rotas) por URL; senão é barrado.
// Assim menu e acesso nunca divergem — fonte única de verdade.
// '/dashboard' (raiz) exige match exato; os demais aceitam a rota + sub-rotas.
// Páginas administrativas fora do NAV (relatórios, mobiliário, comandas,
// usuários) não casam com nenhum item de não-admin => ficam restritas ao admin.
function rotaPermitidaParaCargo(pathname: string, role: string | undefined): boolean {
    if (!role) return false
    return NAV_ITEMS.some((item) => {
        if (!(item.roles as string[]).includes(role)) return false
        if (item.href === '/dashboard') return pathname === '/dashboard'
        return pathname === item.href || pathname.startsWith(item.href + '/')
    })
}

export async function middleware(request: NextRequest) {
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

    const pathname = request.nextUrl.pathname

    // Atualiza a sessão — NUNCA faça outras lógicas antes disso
    const {
        data: { user },
    } = await supabase.auth.getUser()

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

    // RBAC: Controle de Acesso Baseado em Função (espelha o menu — ver helper acima)
    if (pathname.startsWith('/dashboard') && user) {
        const { data: usuario } = await supabase
            .from('usuarios')
            .select('role')
            .eq('id', user.id)
            .single()

        const role = usuario?.role

        // Admin acessa tudo. Demais cargos: só as rotas dos seus itens de menu.
        if (role !== 'admin' && !rotaPermitidaParaCargo(pathname, role)) {
            return NextResponse.redirect(new URL('/selecionar-ambiente', request.url))
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
