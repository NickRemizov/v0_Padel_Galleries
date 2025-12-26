import { NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get("limit") || "10"
  
  const response = await apiFetch(`/api/admin/training/history?limit=${limit}`)
  
  return NextResponse.json(response)
}
