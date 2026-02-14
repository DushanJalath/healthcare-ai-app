import { useEffect } from 'react'
import { useRouter } from 'next/router'

/**
 * Patients list page removed. Redirect to clinic users (same patient list).
 */
export default function PatientsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/clinic/users')
  }, [router])

  return null
}
