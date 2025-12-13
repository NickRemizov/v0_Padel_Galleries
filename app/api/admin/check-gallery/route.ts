import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const galleryId = searchParams.get("id")

  const supabase = await createClient()

  try {
    // Если передан ID - проверяем конкретную галерею
    if (galleryId) {
      const { data: gallery } = await supabase.from("galleries").select("id, title, date").eq("id", galleryId).single()

      if (!gallery) {
        return NextResponse.json({ error: "Gallery not found" }, { status: 404 })
      }

      // Получаем статистику по галерее
      const { data: images } = await supabase
        .from("gallery_images")
        .select("id, has_been_processed")
        .eq("gallery_id", galleryId)

      const imageIds = images?.map((img) => img.id) || []

      let faces: any[] = []
      if (imageIds.length > 0) {
        const { data: facesData } = await supabase
          .from("photo_faces")
          .select("photo_id, person_id, recognition_confidence, verified")
          .in("photo_id", imageIds)

        faces = facesData || []
      }

      const stats = {
        total_photos: images?.length || 0,
        processed_photos: images?.filter((img) => img.has_been_processed).length || 0,
        total_faces: faces.length,
        faces_with_person: faces.filter((f) => f.person_id !== null).length,
        faces_conf_1: faces.filter((f) => f.recognition_confidence === 1).length,
        faces_conf_null: faces.filter((f) => f.recognition_confidence === null).length,
        faces_conf_null_with_person: faces.filter((f) => f.recognition_confidence === null && f.person_id !== null)
          .length,
      }

      return NextResponse.json({ gallery, stats })
    }

    // Иначе ищем галереи по названию
    const searchTerm = searchParams.get("search") || "дружеск"
    const { data: galleries } = await supabase
      .from("galleries")
      .select("id, title, date, created_at")
      .ilike("title", `%${searchTerm}%`)
      .order("date", { ascending: false })
      .limit(10)

    // Добавляем количество фото для каждой галереи
    const galleriesWithCounts = await Promise.all(
      (galleries || []).map(async (g) => {
        const { count } = await supabase
          .from("gallery_images")
          .select("*", { count: "exact", head: true })
          .eq("gallery_id", g.id)

        return { ...g, photo_count: count || 0 }
      }),
    )

    return NextResponse.json({ galleries: galleriesWithCounts })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
