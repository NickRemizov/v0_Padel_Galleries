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
 * Returns Authorization header with admin_token JWT (from Google OAuth)
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { cookies } = await import("next/headers")
  const cookieStore = await cookies()
  const adminToken = cookieStore.get("admin_token")?.value

  if (adminToken) {
    return { "Authorization": `Bearer ${adminToken}` }
  }
  return {}
}
