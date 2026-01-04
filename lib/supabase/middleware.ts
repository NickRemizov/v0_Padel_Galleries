import { NextResponse, type NextRequest } from "next/server"

/**
 * Admin Auth Middleware
 * Checks for admin_token cookie (JWT from Google OAuth).
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request })
  const path = request.nextUrl.pathname

  // Only protect /admin/* routes
  if (!path.startsWith("/admin")) {
    return response
  }

  // Auth routes are always public
  const isAuthRoute =
    path === "/admin/login" ||
    path.startsWith("/admin/callback") ||
    path.startsWith("/admin/auth")

  if (isAuthRoute) {
    return response
  }

  // Check for admin_token cookie
  const adminToken = request.cookies.get("admin_token")?.value

  // DEBUG: Log all cookies
  const allCookies = request.cookies.getAll()
  console.log(`[Middleware] Path: ${path}, Cookies: [${allCookies.map(c => c.name).join(", ")}], admin_token: ${adminToken ? "YES" : "NO"}`)

  if (!adminToken) {
    console.log(`[Middleware] No admin_token, redirecting to login`)
    const url = request.nextUrl.clone()
    url.pathname = "/admin/login"
    return NextResponse.redirect(url)
  }

  // Token exists - basic validation (full validation happens in backend)
  // JWT format: header.payload.signature
  const parts = adminToken.split(".")
  if (parts.length !== 3) {
    // Invalid token format - redirect to login
    const url = request.nextUrl.clone()
    url.pathname = "/admin/login"
    const response = NextResponse.redirect(url)
    // Clear invalid cookie
    response.cookies.delete("admin_token")
    return response
  }

  // Check if token is expired (decode payload without verification)
  try {
    const payload = JSON.parse(atob(parts[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      // Token expired - redirect to login
      const url = request.nextUrl.clone()
      url.pathname = "/admin/login"
      const response = NextResponse.redirect(url)
      response.cookies.delete("admin_token")
      return response
    }
  } catch {
    // Invalid payload - redirect to login
    const url = request.nextUrl.clone()
    url.pathname = "/admin/login"
    const response = NextResponse.redirect(url)
    response.cookies.delete("admin_token")
    return response
  }

  return response
}
