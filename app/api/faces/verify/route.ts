import { NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const result = await apiFetch("/api/faces/verify", {
      method: "POST",
      body: JSON.stringify(body),
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[API Proxy] verify error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: error.status || 500 })
  }
}
