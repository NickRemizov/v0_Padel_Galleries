import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

export async function POST(request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params

    const supabase = createServiceClient()

    // Call the database function to increment download count
    const { data, error } = await supabase.rpc("increment_download_count", {
      image_id: imageId,
    })

    if (error) {
      console.error("[v0] Error incrementing download count:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in download API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
