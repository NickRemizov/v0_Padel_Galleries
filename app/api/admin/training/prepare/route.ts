import { NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const body = await request.json()
  
  const response = await apiFetch("/api/admin/training/prepare", {
    method: "POST",
    body: JSON.stringify(body),
  })
  
  return NextResponse.json(response)
}
