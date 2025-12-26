import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { apiFetch } from "@/lib/apiClient"

export async function POST(request: NextRequest) {
  try {
    logger.debug("recognition-api", "Rebuild index endpoint called")

    // Call FastAPI backend to rebuild the index
    // P0.5 fix: correct path is /api/recognition/rebuild-index
    const result = await apiFetch<{
      success: boolean
      data?: {
        old_descriptor_count: number
        new_descriptor_count: number
        unique_people_count: number
      }
      error?: string
    }>("/api/recognition/rebuild-index", {
      method: "POST",
    })

    if (!result.success) {
      logger.error("recognition-api", "Failed to rebuild index:", result.error)
      return NextResponse.json({ success: false, error: result.error || "Failed to rebuild index" }, { status: 500 })
    }

    const data = result.data
    logger.info("recognition-api", "Index rebuilt successfully:", {
      oldCount: data?.old_descriptor_count,
      newCount: data?.new_descriptor_count,
      uniquePeople: data?.unique_people_count,
    })

    return NextResponse.json({
      success: true,
      old_descriptor_count: data?.old_descriptor_count,
      new_descriptor_count: data?.new_descriptor_count,
      unique_people_count: data?.unique_people_count,
    })
  } catch (error: any) {
    logger.error("recognition-api", "Error rebuilding index:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 })
  }
}
