import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { jwtDecode } from "jwt-decode"

interface AdminPayload {
  sub: string
  email: string
  name?: string
  role: string
  exp: number
}

/**
 * Server-side guard для защиты admin API роутов
 * Проверяет наличие валидного admin_token JWT (от Google OAuth)
 *
 * @returns { admin, error } - объект с админом или ошибкой
 */
export async function requireAdmin() {
  const cookieStore = await cookies()
  const adminToken = cookieStore.get("admin_token")?.value

  if (!adminToken) {
    return {
      admin: null,
      error: NextResponse.json({ error: "Unauthorized: Authentication required" }, { status: 401 }),
    }
  }

  try {
    const payload = jwtDecode<AdminPayload>(adminToken)

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return {
        admin: null,
        error: NextResponse.json({ error: "Unauthorized: Token expired" }, { status: 401 }),
      }
    }

    // Check role exists
    if (!payload.role) {
      return {
        admin: null,
        error: NextResponse.json({ error: "Forbidden: No admin role" }, { status: 403 }),
      }
    }

    return {
      admin: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
      },
      error: null,
    }
  } catch {
    return {
      admin: null,
      error: NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 }),
    }
  }
}

/**
 * Get auth headers for protected API calls to FastAPI backend
 *
 * Supports both:
 * - admin_token cookie (Google OAuth) - preferred
 * - Supabase session (legacy) - fallback
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const cookieStore = await cookies()

  // 1. Try admin_token (Google OAuth)
  const adminToken = cookieStore.get("admin_token")?.value
  if (adminToken) {
    return { "Authorization": `Bearer ${adminToken}` }
  }

  // 2. Fallback: try Supabase session
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session?.access_token) {
    return { "Authorization": `Bearer ${session.access_token}` }
  }

  return {}
}
