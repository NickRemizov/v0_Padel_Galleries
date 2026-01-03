/**
 * Admin Authentication Library
 *
 * Uses Google OAuth via Python backend.
 * Token stored in localStorage and passed via Authorization header.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.vlcpadel.com"
const TOKEN_KEY = "admin_token"

export interface AdminUser {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  role: "owner" | "global_admin" | "local_admin" | "moderator"
  is_active: boolean
}

/**
 * Get token from localStorage
 */
export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}

/**
 * Save token to localStorage
 */
export function setToken(token: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(TOKEN_KEY, token)
}

/**
 * Remove token from localStorage
 */
export function removeToken(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Get current admin from backend
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const token = getToken()
  if (!token) return null

  try {
    const response = await fetch(`${API_URL}/api/admin/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      if (response.status === 401) {
        removeToken() // Token expired/invalid
      }
      return null
    }

    return await response.json()
  } catch (error) {
    console.error("[admin-auth] Error getting current admin:", error)
    return null
  }
}

/**
 * Get login URL (redirect to Google OAuth)
 */
export function getLoginUrl(): string {
  return `${API_URL}/api/admin/auth/login`
}

/**
 * Logout - clear token from localStorage, cookie, and Supabase session
 */
export function logout(): void {
  removeToken()
  if (typeof document !== "undefined") {
    // Clear admin_token cookie (used by middleware)
    document.cookie = "admin_token=; path=/; max-age=0"
    // Clear all Supabase cookies (legacy auth cleanup)
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0].trim()
      if (name.startsWith("sb-")) {
        document.cookie = `${name}=; path=/; max-age=0`
      }
    })
  }
}

/**
 * Check if admin has required role
 */
export function hasRole(
  admin: AdminUser | null,
  requiredRoles: AdminUser["role"][]
): boolean {
  if (!admin) return false
  return requiredRoles.includes(admin.role)
}

/**
 * Role hierarchy for permission checks
 */
export const ROLE_HIERARCHY: Record<AdminUser["role"], number> = {
  owner: 4,
  global_admin: 3,
  local_admin: 2,
  moderator: 1,
}

/**
 * Check if admin has at least the minimum role level
 */
export function hasMinRole(
  admin: AdminUser | null,
  minRole: AdminUser["role"]
): boolean {
  if (!admin) return false
  return ROLE_HIERARCHY[admin.role] >= ROLE_HIERARCHY[minRole]
}

/**
 * Make authenticated API request
 */
export async function adminFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken()

  const headers = new Headers(options.headers)
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })
}
