import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"

/**
 * POST /api/admin/training/execute
 * 
 * Proxy to FastAPI with Supabase JWT token for authentication.
 * Backend requires admin authorization (Phase 1).
 */
export async function POST(request: NextRequest) {
  // Get Supabase session
  const supabase = await createClient()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  // Check if user is authenticated
  if (sessionError || !session) {
    console.error("[v0] No session for training/execute")
    return NextResponse.json(
      { error: "Unauthorized: Authentication required" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()

    console.log("[v0] Starting training, user:", session.user.email)
    console.log("[v0] Request body:", JSON.stringify(body))

    // Call FastAPI with Supabase JWT token
    const response = await fetch(`${env.FASTAPI_URL}/api/v2/train/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,  // Pass token to FastAPI
      },
      body: JSON.stringify(body),
    })

    const responseData = await response.json()

    // Handle FastAPI errors
    if (!response.ok) {
      console.error("[v0] FastAPI error:", response.status, responseData)
      return NextResponse.json(
        { error: responseData.error || responseData.detail || "Training failed" },
        { status: response.status }
      )
    }

    // Success - return data from FastAPI
    if (responseData.success && responseData.data) {
      console.log("[v0] Training started, session_id:", responseData.data.session_id)
      return NextResponse.json(responseData.data)
    }

    // Fallback for non-standard response
    return NextResponse.json(responseData)

  } catch (error) {
    console.error("[v0] Error executing training:", error)

    // Handle network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return NextResponse.json(
        { error: "FastAPI server not available" },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute training" },
      { status: 500 }
    )
  }
}
