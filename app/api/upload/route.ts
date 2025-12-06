import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Upload to Vercel Blob
    const blob = await put(file.name, file, {
      access: "public",
      addRandomSuffix: true,
    })

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
      size: file.size,
      type: file.type,
    })
  } catch (error) {
    console.error("Upload error:", error)

    if (error instanceof Error) {
      // Check if it's a quota exceeded error
      if (error.message.includes("Storage quota exceeded")) {
        return NextResponse.json(
          {
            error: "Квота хранилища исчерпана. Пожалуйста, удалите старые изображения или обновите план.",
            code: "QUOTA_EXCEEDED",
          },
          { status: 507 },
        )
      }

      return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 })
    }

    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
