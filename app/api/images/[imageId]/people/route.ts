import { NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export async function GET(request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params
    const result = await apiFetch<{ success: boolean; data: { id: string; name: string }[] }>(
      `/api/images/${imageId}/people`,
    )

    if (!result.success || !result.data) {
      console.error("[v0] Error fetching verified people:", result)
      return NextResponse.json([], { status: 200 })
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error("[v0] Error in people API:", error)
    return NextResponse.json([], { status: 200 })
  }
}
