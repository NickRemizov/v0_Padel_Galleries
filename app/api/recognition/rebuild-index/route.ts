/**
 * Recognition Rebuild Index API Route
 * 
 * Proxies to FastAPI: POST /api/recognition/rebuild-index
 * 
 * @migrated 2025-12-27 - Unified response format
 */

import { type NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { apiFetch } from "@/lib/apiClient"

export async function POST(request: NextRequest) {
  try {
    logger.debug("recognition-api", "Rebuild index endpoint called")

    const result = await apiFetch("/api/recognition/rebuild-index", {
      method: "POST",
    })

    if (result.success) {
      logger.info("recognition-api", "Index rebuilt successfully:", result.data)
    } else {
      logger.error("recognition-api", "Failed to rebuild index:", result.error)
    }

    // Pass through unified response format
    return NextResponse.json(result, {
      status: result.success ? 200 : 500
    })
  } catch (error: any) {
    logger.error("recognition-api", "Error rebuilding index:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "Internal server error",
        code: "FETCH_ERROR"
      }, 
      { status: 500 }
    )
  }
}
