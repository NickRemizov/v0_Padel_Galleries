import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function POST(request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params

    const cookieStore = await cookies()
    const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    })

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
