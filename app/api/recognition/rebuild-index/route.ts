import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { apiFetch } from "@/lib/apiClient"

export async function POST(request: NextRequest) {
  try {
    logger.debug("recognition-api", "Rebuild index endpoint called")

    // Call FastAPI backend to rebuild the index
    const result = await apiFetch<{
      success: boolean
      old_descriptor_count: number
      new_descriptor_count: number
      unique_people_count: number
      error?: string
    }>("/rebuild-index", {
      method: "POST",
    })

    if (!result.success) {
      logger.error("recognition-api", "Failed to rebuild index:", result.error)
      return NextResponse.json({ success: false, error: result.error || "Failed to rebuild index" }, { status: 500 })
    }

    logger.info("recognition-api", "Index rebuilt successfully:", {
      oldCount: result.old_descriptor_count,
      newCount: result.new_descriptor_count,
      uniquePeople: result.unique_people_count,
    })

    return NextResponse.json({
      success: true,
      old_descriptor_count: result.old_descriptor_count,
      new_descriptor_count: result.new_descriptor_count,
      unique_people_count: result.unique_people_count,
    })
  } catch (error: any) {
    logger.error("recognition-api", "Error rebuilding index:", error)
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 })
  }
}
