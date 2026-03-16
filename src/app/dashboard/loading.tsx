import { Loader2 } from "lucide-react"

export default function Loading() {
    return (
        <div className="flex h-[80vh] w-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium text-gray-500 animate-pulse">Carregando dados da tela...</p>
            </div>
        </div>
    )
}
