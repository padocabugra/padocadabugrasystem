import { Loader2 } from "lucide-react"

export default function LoadingRoot() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-blue-50/10">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium text-gray-500 animate-pulse">Acessando sistema...</p>
            </div>
        </div>
    )
}
