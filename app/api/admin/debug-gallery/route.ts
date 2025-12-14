import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const galleryId = searchParams.get("id")
  const fix = searchParams.get("fix") === "true"

  const supabase = await createClient()

  try {
    // Если ID не указан - показать список галерей с проблемами
    if (!galleryId) {
      const { data: galleries } = await supabase
        .from("galleries")
        .select(`
          id,
          slug, 
          title, 
          shoot_date,
          gallery_images (
            id,
            slug,
            has_been_processed
          )
        `)
        .order("shoot_date", { ascending: false })

      const problemGalleries = []

      for (const gallery of galleries || []) {
        const images = (gallery.gallery_images as any[]) || []
        const total = images.length
        const processed = images.filter((img: any) => img.has_been_processed).length
        const imageIds = images.map((img: any) => img.id)

        // Проверяем сколько фото реально имеют faces
        let photosWithFaces = 0
        if (imageIds.length > 0) {
          const { data: faces } = await supabase
            .from("photo_faces")
            .select("photo_id")
            .in("photo_id", imageIds)

          const uniquePhotoIds = new Set(faces?.map(f => f.photo_id) || [])
          photosWithFaces = uniquePhotoIds.size
        }

        // Есть проблема если:
        // 1. processed != total (не все обработаны)
        // 2. processed != photosWithFaces (рассинхрон флага)
        if (processed !== total || processed !== photosWithFaces) {
          problemGalleries.push({
            id: gallery.id,
            slug: gallery.slug,
            title: gallery.title,
            shoot_date: gallery.shoot_date,
            total_photos: total,
            processed_flag: processed,
            photos_with_faces: photosWithFaces,
            issues: {
              unprocessed: total - processed,
              flag_mismatch: processed !== photosWithFaces
            }
          })
        }
      }

      return NextResponse.json({
        total_galleries: galleries?.length || 0,
        problem_galleries: problemGalleries.length,
        galleries: problemGalleries
      })
    }

    // Детальная диагностика конкретной галереи
    const { data: gallery } = await supabase
      .from("galleries")
      .select("id, slug, title, shoot_date")
      .eq("id", galleryId)
      .single()

    if (!gallery) {
      return NextResponse.json({ error: "Gallery not found" }, { status: 404 })
    }

    // Все фото галереи
    const { data: images } = await supabase
      .from("gallery_images")
      .select("id, slug, original_filename, has_been_processed, created_at")
      .eq("gallery_id", galleryId)
      .order("original_filename")

    const imageIds = images?.map((img) => img.id) || []

    // Все лица для этих фото
    let allFaces: any[] = []
    if (imageIds.length > 0) {
      const { data: facesData } = await supabase
        .from("photo_faces")
        .select("id, photo_id, person_id, recognition_confidence, verified")
        .in("photo_id", imageIds)

      allFaces = facesData || []
    }

    // Группируем лица по photo_id
    const facesByPhoto: Record<string, any[]> = {}
    for (const face of allFaces) {
      if (!facesByPhoto[face.photo_id]) {
        facesByPhoto[face.photo_id] = []
      }
      facesByPhoto[face.photo_id].push(face)
    }

    // Анализируем каждое фото
    const photoAnalysis = (images || []).map(img => {
      const faces = facesByPhoto[img.id] || []
      const hasFaces = faces.length > 0
      const flagCorrect = img.has_been_processed === hasFaces

      return {
        id: img.id,
        slug: img.slug,
        filename: img.original_filename,
        has_been_processed: img.has_been_processed,
        faces_count: faces.length,
        faces_with_person: faces.filter(f => f.person_id !== null).length,
        faces_unknown: faces.filter(f => f.person_id === null).length,
        faces_verified: faces.filter(f => f.recognition_confidence === 1).length,
        faces_unverified: faces.filter(f => f.recognition_confidence !== null && f.recognition_confidence < 1).length,
        faces_conf_null: faces.filter(f => f.recognition_confidence === null).length,
        flag_correct: flagCorrect,
        issue: !flagCorrect 
          ? (hasFaces && !img.has_been_processed 
              ? "HAS_FACES_BUT_NOT_PROCESSED" 
              : (!hasFaces && img.has_been_processed 
                  ? "NO_FACES_BUT_MARKED_PROCESSED" 
                  : null))
          : null
      }
    })

    // Фото с проблемами
    const problemPhotos = photoAnalysis.filter(p => !p.flag_correct)
    
    // Фото без лиц вообще (даже unknown)
    const photosWithoutAnyFaces = photoAnalysis.filter(p => p.faces_count === 0)
    
    // Фото с лицами но has_been_processed=false
    const photosWithFacesButNotProcessed = photoAnalysis.filter(
      p => p.faces_count > 0 && !p.has_been_processed
    )
    
    // Фото без лиц но has_been_processed=true (странно, но возможно)
    const photosNoFacesButProcessed = photoAnalysis.filter(
      p => p.faces_count === 0 && p.has_been_processed
    )

    // Исправление если запрошено
    let fixResults = null
    if (fix && problemPhotos.length > 0) {
      fixResults = { fixed: 0, errors: [] as string[] }

      for (const photo of problemPhotos) {
        const shouldBeProcessed = photo.faces_count > 0
        
        const { error } = await supabase
          .from("gallery_images")
          .update({ has_been_processed: shouldBeProcessed })
          .eq("id", photo.id)

        if (error) {
          fixResults.errors.push(`${photo.filename}: ${error.message}`)
        } else {
          fixResults.fixed++
        }
      }
    }

    // Статистика
    const stats = {
      total_photos: images?.length || 0,
      processed_by_flag: images?.filter(img => img.has_been_processed).length || 0,
      photos_with_faces: photoAnalysis.filter(p => p.faces_count > 0).length,
      total_faces: allFaces.length,
      faces_with_person: allFaces.filter(f => f.person_id !== null).length,
      faces_unknown: allFaces.filter(f => f.person_id === null).length,
      faces_verified: allFaces.filter(f => f.recognition_confidence === 1).length,
      faces_conf_null: allFaces.filter(f => f.recognition_confidence === null).length
    }

    // Проблемы
    const issues = {
      total_problems: problemPhotos.length,
      has_faces_but_not_processed: photosWithFacesButNotProcessed.length,
      no_faces_but_marked_processed: photosNoFacesButProcessed.length,
      photos_without_any_faces: photosWithoutAnyFaces.length
    }

    return NextResponse.json({
      gallery,
      stats,
      issues,
      problem_photos: problemPhotos.slice(0, 20), // Лимит для читаемости
      photos_without_faces: photosWithoutAnyFaces.slice(0, 10).map(p => ({
        id: p.id,
        slug: p.slug,
        filename: p.filename,
        has_been_processed: p.has_been_processed
      })),
      fix_results: fixResults,
      hint: problemPhotos.length > 0 
        ? "Add ?fix=true to auto-fix has_been_processed flags" 
        : "No issues found"
    })

  } catch (error: any) {
    console.error("[debug-gallery] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
