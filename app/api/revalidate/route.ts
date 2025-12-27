import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

/**
 * On-Demand Revalidation API
 * 
 * POST /api/revalidate
 * Body: { paths: ["/players", "/gallery"] }
 * Header: x-revalidate-token (optional, for external calls)
 * 
 * Revalidates ISR cache for specified paths.
 * Called from admin actions after data changes.
 */

const REVALIDATE_TOKEN = process.env.REVALIDATE_SECRET || "padel-revalidate-2024"

export async function POST(request: NextRequest) {
  try {
    // Check token for external calls (optional for internal)
    const token = request.headers.get("x-revalidate-token")
    const isInternal = request.headers.get("origin")?.includes("vercel.app") || 
                       request.headers.get("origin")?.includes("localhost")
    
    if (!isInternal && token !== REVALIDATE_TOKEN) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const body = await request.json()
    const paths: string[] = body.paths || []

    if (paths.length === 0) {
      return NextResponse.json({ error: "No paths provided" }, { status: 400 })
    }

    // Revalidate each path
    const results: Record<string, boolean> = {}
    for (const path of paths) {
      try {
        revalidatePath(path)
        results[path] = true
        console.log(`[revalidate] Revalidated: ${path}`)
      } catch (e) {
        console.error(`[revalidate] Failed to revalidate ${path}:`, e)
        results[path] = false
      }
    }

    return NextResponse.json({ 
      success: true, 
      revalidated: results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error("[revalidate] Error:", error)
    return NextResponse.json(
      { error: "Failed to revalidate" },
      { status: 500 }
    )
  }
}
