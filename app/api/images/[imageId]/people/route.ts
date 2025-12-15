import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  try {
    const { imageId } = await params
    const supabase = await createClient()

    // Get all people with assigned person_id on this photo
    const { data: faces, error } = await supabase
      .from("photo_faces")
      .select(`
        person_id,
        people!inner(id, real_name, telegram_name)
      `)
      .eq("photo_id", imageId)
      .not("person_id", "is", null)

    if (error) {
      console.error("[v0] Error fetching people for image:", error)
      return NextResponse.json([], { status: 200 })
    }

    // Map to simple format
    const people = faces?.map((face: any) => ({
      id: face.people.id,
      name: face.people.real_name || face.people.telegram_name || "Unknown",
    })) || []

    // Remove duplicates (same person might have multiple faces)
    const uniquePeople = Array.from(
      new Map(people.map((p: any) => [p.id, p])).values()
    )

    return NextResponse.json(uniquePeople)
  } catch (error) {
    console.error("[v0] Error in people API:", error)
    return NextResponse.json([], { status: 200 })
  }
}
