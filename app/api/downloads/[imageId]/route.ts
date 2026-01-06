import { NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export async function POST(request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params

    const result = await apiFetch(
      `/api/user/images/${imageId}/download`,
      { method: "POST" }
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[downloads] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
