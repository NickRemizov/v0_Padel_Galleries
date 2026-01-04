import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { env } from "@/lib/env"

// Max file size: 12MB
const MAX_FILE_SIZE = 12 * 1024 * 1024

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
    const folder = (formData.get("folder") as string) || "photos"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Файл слишком большой. Максимум: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 413 }
      )
    }

    // Get admin_token from cookies (set by Google OAuth)
    const cookieStore = await cookies()
    const adminToken = cookieStore.get("admin_token")?.value

    if (!adminToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // 1. Get presigned URL from Python API
    const presignResponse = await fetch(`${env.FASTAPI_URL}/api/images/presign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ filenames: [file.name], folder }),
    })

    if (!presignResponse.ok) {
      const err = await presignResponse.json()
      return NextResponse.json(
        { error: err.detail || "Failed to get upload URL" },
        { status: presignResponse.status }
      )
    }

    const presignData = await presignResponse.json()
    const uploadInfo = presignData.data?.[0]

    if (!uploadInfo?.upload_url) {
      return NextResponse.json({ error: "Invalid presign response" }, { status: 500 })
    }

    // 2. Upload directly to MinIO
    const fileBuffer = await file.arrayBuffer()
    const uploadResponse = await fetch(uploadInfo.upload_url, {
      method: "PUT",
      body: fileBuffer,
      headers: {
        "Content-Type": file.type || "image/jpeg",
      },
    })

    if (!uploadResponse.ok) {
      return NextResponse.json(
        { error: "Upload to storage failed" },
        { status: uploadResponse.status }
      )
    }

    // 3. Return public URL
    return NextResponse.json({
      url: uploadInfo.public_url,
      filename: file.name,
      size: file.size,
      type: file.type,
    })
  } catch (error) {
    console.error("Upload error:", error)

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 })
    }

    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
