// Route group (public) — sem layout adicional, apenas isola a rota do (auth)
export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
