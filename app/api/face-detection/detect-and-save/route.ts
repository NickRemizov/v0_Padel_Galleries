import { type NextRequest, NextResponse } from "next/server"
import { getApiBaseUrl } from "@/app/admin/utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const apiUrl = `${getApiBaseUrl()}/detect-and-save-faces`

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[detect-and-save proxy] Error:", errorText)
      return NextResponse.json({ error: errorText }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[detect-and-save proxy] Error:", error)
    return NextResponse.json({ error: "Failed to detect and save faces" }, { status: 500 })
  }
}
