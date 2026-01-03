"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import { getCurrentAdmin, getToken, type AdminUser } from "@/lib/admin-auth"
import { Loader2 } from "lucide-react"

interface AdminAuthContextType {
  admin: AdminUser | null
  loading: boolean
  refresh: () => Promise<void>
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  admin: null,
  loading: true,
  refresh: async () => {},
})

export function useAdminAuth() {
  return useContext(AdminAuthContext)
}

interface AdminAuthProviderProps {
  children: ReactNode
}

export function AdminAuthProvider({ children }: AdminAuthProviderProps) {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  const refresh = async () => {
    const token = getToken()
    if (!token) {
      setAdmin(null)
      setLoading(false)
      return
    }

    try {
      const adminData = await getCurrentAdmin()
      setAdmin(adminData)
    } catch (error) {
      console.error("[AdminAuthProvider] Error:", error)
      setAdmin(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (!loading && !admin && !pathname.includes("/login") && !pathname.includes("/callback")) {
      router.push("/admin/login")
    }
  }, [loading, admin, pathname, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  // Allow login and callback pages without auth
  if (pathname.includes("/login") || pathname.includes("/callback")) {
    return <>{children}</>
  }

  // Redirect to login if not authenticated
  if (!admin) {
    return null
  }

  return (
    <AdminAuthContext.Provider value={{ admin, loading, refresh }}>
      {children}
    </AdminAuthContext.Provider>
  )
}
