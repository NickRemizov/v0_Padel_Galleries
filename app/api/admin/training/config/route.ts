import { NextRequest, NextResponse } from "next/server"
import { apiFetch } from "@/lib/apiClient"

export const dynamic = "force-dynamic"

export async function GET() {
  const response = await apiFetch("/api/admin/training/config")
  return NextResponse.json(response)
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  
  const response = await apiFetch("/api/admin/training/config", {
    method: "PUT",
    body: JSON.stringify(body),
  })
  
  return NextResponse.json(response)
}
