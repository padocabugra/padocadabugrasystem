import { redirect } from 'next/navigation'

// Página raiz — redireciona para /login
// O proxy.ts cuida de redirecionar para /dashboard se já estiver logado
export default function RootPage() {
  redirect('/login')
}
