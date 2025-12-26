import { NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const top = searchParams.get("top") || "15"
  
  const response = await apiFetch(`/api/admin/face-statistics?top=${top}`)
  
  return NextResponse.json(response)
}
