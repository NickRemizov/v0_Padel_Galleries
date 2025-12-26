import { NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  
  const response = await apiFetch(`/api/admin/training/status/${sessionId}`)
  
  return NextResponse.json(response)
}
