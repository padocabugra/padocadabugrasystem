export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="auth-container min-h-screen flex items-center justify-center bg-blue-50/30">
            {children}
        </div>
    )
}
