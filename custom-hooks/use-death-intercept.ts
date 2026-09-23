import { useEffect } from 'react'
import { registerDeathIntercept } from '@/lib/client/death-intercept'

export function useDeathIntercept() {
  useEffect(() => {
    const unregister = registerDeathIntercept()
    return () => {
      unregister()
    }
  }, [])
}
