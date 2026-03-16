import { useEffect, useState } from 'react'

/**
 * Atrasa a atualização de um valor por `delay` ms.
 * Ideal para evitar chamadas excessivas ao banco durante digitação.
 *
 * @example
 * const debouncedSearch = useDebounce(searchTerm, 400)
 */
export function useDebounce<T>(value: T, delay = 400): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value)

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value)
        }, delay)

        return () => clearTimeout(timer)
    }, [value, delay])

    return debouncedValue
}
