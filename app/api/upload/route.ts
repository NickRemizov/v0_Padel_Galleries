import { type NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/env"

export async function POST(request: NextRequest) {
  try {
    if (!env.FASTAPI_URL) {
      return NextResponse.json(
        { error: "Backend API not configured" },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Forward to Python API
    const pythonFormData = new FormData()
    pythonFormData.append("file", file)

    const response = await fetch(`${env.FASTAPI_URL}/api/images/upload`, {
      method: "POST",
      body: pythonFormData,
    })

    const data = await response.json()

    if (!response.ok) {
      const errorMessage = data.error || data.detail || "Upload failed"
      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    // Extract data from Python API response format {success: true, data: {...}}
    const uploadData = data.data || data

    return NextResponse.json({
      url: uploadData.url,
      filename: uploadData.original_filename || file.name,
      size: uploadData.size || file.size,
      type: uploadData.content_type || file.type,
    })
  } catch (error) {
    console.error("Upload error:", error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 })
    }

    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
