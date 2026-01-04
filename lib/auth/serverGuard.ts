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

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return {
        admin: null,
        error: NextResponse.json({ error: "Unauthorized: Token expired" }, { status: 401 }),
      }
    }

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
 * Uses admin_token cookie from Google OAuth
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const cookieStore = await cookies()
  const adminToken = cookieStore.get("admin_token")?.value

  // DEBUG: Log all cookies to understand what's happening
  const allCookies = cookieStore.getAll()
  console.log("[getAuthHeaders] All cookies:", allCookies.map(c => c.name))
  console.log("[getAuthHeaders] admin_token exists:", !!adminToken)

  if (adminToken) {
    return { "Authorization": `Bearer ${adminToken}` }
  }

  console.error("[getAuthHeaders] NO admin_token cookie found!")
  return {}
}
