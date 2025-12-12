import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()

  try {
    // ========== БАЗОВЫЕ ЗАПРОСЫ ==========
    const [
      { count: totalPeopleCount },
      { count: totalPhotoFacesCount },
      { count: verifiedFacesCount },
      { data: peopleWithVerifiedFaces },
      { data: personStats },
      { data: allPeople },
      { count: unknownFacesCount },
      { count: photosWithoutFacesCount },
      { data: galleries },
      { count: inconsistentCount },
      { count: orphanedDescriptorsCount },
      { count: facesWithoutDescriptors },
    ] = await Promise.all([
      // Всего игроков
      supabase
        .from("people")
        .select("*", { count: "exact", head: true }),
      // Всего лиц
      supabase
        .from("photo_faces")
        .select("*", { count: "exact", head: true }),
      // Подтверждённых лиц (verified=true)
      supabase
        .from("photo_faces")
        .select("*", { count: "exact", head: true })
        .eq("verified", true),
      // Уникальные person_id с verified=true
      supabase
        .from("photo_faces")
        .select("person_id")
        .eq("verified", true)
        .not("person_id", "is", null),
      // Статистика по людям (для подсчёта фото на человека)
      supabase
        .from("photo_faces")
        .select("person_id")
        .eq("verified", true)
        .not("person_id", "is", null),
      // Все люди с именами и аватарами
      supabase
        .from("people")
        .select("id, real_name, telegram_name, avatar_url"),
      // Неизвестные лица (person_id=NULL)
      supabase
        .from("photo_faces")
        .select("*", { count: "exact", head: true })
        .is("person_id", null),
      // Фото без лиц (has_been_processed=true, но нет записей в photo_faces)
      supabase
        .from("gallery_images")
        .select("*", { count: "exact", head: true })
        .eq("has_been_processed", true)
        .not("id", "in", supabase.from("photo_faces").select("photo_id")),
      // Галереи со статистикой
      supabase
        .from("galleries")
        .select("id, title"),
      // Несогласованные записи (verified=true, но confidence != 1)
      supabase
        .from("photo_faces")
        .select("*", { count: "exact", head: true })
        .eq("verified", true)
        .neq("recognition_confidence", 1),
      // Осиротевшие дескрипторы (photo_id не существует в gallery_images)
      supabase.rpc("count_orphaned_descriptors"),
      // Лица с person_id но без дескриптора
      supabase
        .from("photo_faces")
        .select("id", { count: "exact", head: true })
        .not("person_id", "is", null)
        .is("insightface_descriptor", null),
    ])

    const totalPeople = totalPeopleCount || 0
    const totalFaces = totalPhotoFacesCount || 0
    const verifiedFaces = verifiedFacesCount || 0
    const unknownFaces = unknownFacesCount || 0

    // ========== ПОДСЧЁТ ЛИЦ НА ЧЕЛОВЕКА ==========
    const personCounts =
      personStats?.reduce((acc: Record<string, number>, face) => {
        acc[face.person_id] = (acc[face.person_id] || 0) + 1
        return acc
      }, {}) || {}

    const faceCounts = Object.values(personCounts) as number[]
    const peopleWithFaces = faceCounts.length

    // Уникальные люди с подтверждёнными фото
    const uniquePeopleWithVerified = new Set(peopleWithVerifiedFaces?.map((f) => f.person_id) || [])
    const peopleWithVerifiedCount = uniquePeopleWithVerified.size

    // ========== ИГРОКИ С <3 ФОТО ==========
    const peopleWithFewPhotos: Array<{ id: string; name: string; count: number }> = []
    const peopleMap = new Map(allPeople?.map((p) => [p.id, p]) || [])

    for (const [personId, count] of Object.entries(personCounts)) {
      if (count < 3) {
        const person = peopleMap.get(personId)
        if (person) {
          peopleWithFewPhotos.push({
            id: personId,
            name: person.real_name || person.telegram_name || "Без имени",
            count: count as number,
          })
        }
      }
    }
    // Сортируем по количеству фото (меньше — выше)
    peopleWithFewPhotos.sort((a, b) => a.count - b.count)

    // ========== ИГРОКИ БЕЗ АВАТАРА ==========
    const peopleWithoutAvatar =
      allPeople
        ?.filter((p) => !p.avatar_url)
        .map((p) => ({
          id: p.id,
          name: p.real_name || p.telegram_name || "Без имени",
        })) || []

    // ========== ТОП-5 ПО КОЛИЧЕСТВУ ФОТО ==========
    const topPeopleByPhotos: Array<{ id: string; name: string; count: number }> = []
    for (const [personId, count] of Object.entries(personCounts)) {
      const person = peopleMap.get(personId)
      if (person) {
        topPeopleByPhotos.push({
          id: personId,
          name: person.real_name || person.telegram_name || "Без имени",
          count: count as number,
        })
      }
    }
    topPeopleByPhotos.sort((a, b) => b.count - a.count)
    const top5People = topPeopleByPhotos.slice(0, 5)

    // ========== СТАТУС ГАЛЕРЕЙ ==========
    let galleriesFullyVerified = 0
    let galleriesPartiallyVerified = 0
    let galleriesNotProcessed = 0

    if (galleries && galleries.length > 0) {
      for (const gallery of galleries) {
        // Получаем фото галереи
        const { data: galleryImages } = await supabase
          .from("gallery_images")
          .select("id, has_been_processed")
          .eq("gallery_id", gallery.id)

        if (!galleryImages || galleryImages.length === 0) {
          galleriesNotProcessed++
          continue
        }

        // Проверяем, все ли фото обработаны и верифицированы
        const processedImages = galleryImages.filter((img) => img.has_been_processed)

        if (processedImages.length === 0) {
          galleriesNotProcessed++
          continue
        }

        // Проверяем верификацию через photo_faces
        const imageIds = galleryImages.map((img) => img.id)
        const { data: faces } = await supabase
          .from("photo_faces")
          .select("photo_id, verified, person_id")
          .in("photo_id", imageIds)

        if (!faces || faces.length === 0) {
          // Все фото NFD или не обработаны
          if (processedImages.length === galleryImages.length) {
            galleriesFullyVerified++ // NFD тоже считается "обработано"
          } else {
            galleriesPartiallyVerified++
          }
          continue
        }

        // Группируем лица по фото
        const facesByPhoto = faces.reduce((acc: Record<string, typeof faces>, face) => {
          if (!acc[face.photo_id]) acc[face.photo_id] = []
          acc[face.photo_id].push(face)
          return acc
        }, {})

        // Проверяем каждое фото
        let allVerified = true
        let anyVerified = false

        for (const img of galleryImages) {
          const imgFaces = facesByPhoto[img.id] || []
          if (imgFaces.length === 0) {
            // NFD - считаем обработанным если has_been_processed
            if (!img.has_been_processed) allVerified = false
          } else {
            const allFacesVerified = imgFaces.every((f) => f.verified && f.person_id)
            if (allFacesVerified) {
              anyVerified = true
            } else {
              allVerified = false
            }
          }
        }

        if (allVerified) {
          galleriesFullyVerified++
        } else if (anyVerified) {
          galleriesPartiallyVerified++
        } else {
          galleriesNotProcessed++
        }
      }
    }

    // ========== СРЕДНЯЯ CONFIDENCE НЕВЕРИФИЦИРОВАННЫХ ==========
    const { data: unverifiedConfidences } = await supabase
      .from("photo_faces")
      .select("recognition_confidence")
      .eq("verified", false)
      .not("person_id", "is", null)
      .not("recognition_confidence", "is", null)

    let avgUnverifiedConfidence = 0
    if (unverifiedConfidences && unverifiedConfidences.length > 0) {
      const sum = unverifiedConfidences.reduce((acc, f) => acc + (f.recognition_confidence || 0), 0)
      avgUnverifiedConfidence = sum / unverifiedConfidences.length
    }

    // ========== ФОРМИРОВАНИЕ ОТВЕТА ==========

    // Если нет данных
    if (peopleWithFaces === 0) {
      return NextResponse.json({
        overall: {
          total_people: totalPeople,
          people_with_verified: 0,
          total_faces: totalFaces,
          total_verified_faces: 0,
          avg_faces_per_person: "0.00",
          min_faces: 0,
          max_faces: 0,
        },
        distribution: [],
        histogram: [
          { face_range: "1-2 лица", people_count: 0, total_faces: 0 },
          { face_range: "3-4 лица", people_count: 0, total_faces: 0 },
          { face_range: "5-9 лиц", people_count: 0, total_faces: 0 },
          { face_range: "10-19 лиц", people_count: 0, total_faces: 0 },
          { face_range: "20+ лиц", people_count: 0, total_faces: 0 },
        ],
        attention: {
          people_with_few_photos: [],
          people_without_avatar: [],
          unknown_faces_count: unknownFaces,
          faces_without_descriptors: 0,
        },
        top_people: [],
        galleries: {
          fully_verified: 0,
          partially_verified: 0,
          not_processed: 0,
          total: galleries?.length || 0,
        },
        integrity: {
          inconsistent_verified_confidence: 0,
          orphaned_descriptors: 0,
          avg_unverified_confidence: 0,
        },
      })
    }

    const avgFaces = verifiedFaces / peopleWithFaces

    // Distribution by thresholds
    const thresholds = [1, 3, 5, 10, 15, 20]
    const distribution = thresholds.map((threshold) => {
      const peopleCount = faceCounts.filter((count) => count >= threshold).length
      const totalFacesForThreshold = faceCounts
        .filter((count) => count >= threshold)
        .reduce((sum, count) => sum + count, 0)

      return {
        threshold: `≥ ${threshold} фото`,
        people_count: peopleCount,
        total_faces: totalFacesForThreshold,
        percentage: ((peopleCount / peopleWithFaces) * 100).toFixed(1),
      }
    })

    // Histogram
    const histogram = [
      { range: "1-2 лица", min: 1, max: 2 },
      { range: "3-4 лица", min: 3, max: 4 },
      { range: "5-9 лиц", min: 5, max: 9 },
      { range: "10-19 лиц", min: 10, max: 19 },
      { range: "20+ лиц", min: 20, max: 9999 },
    ].map((bucket) => {
      const peopleInBucket = faceCounts.filter((count) => count >= bucket.min && count <= bucket.max)
      return {
        face_range: bucket.range,
        people_count: peopleInBucket.length,
        total_faces: peopleInBucket.reduce((sum, count) => sum + count, 0),
      }
    })

    return NextResponse.json({
      overall: {
        total_people: totalPeople,
        people_with_verified: peopleWithVerifiedCount,
        total_faces: totalFaces,
        total_verified_faces: verifiedFaces,
        avg_faces_per_person: avgFaces.toFixed(2),
        min_faces: Math.min(...faceCounts),
        max_faces: Math.max(...faceCounts),
      },
      distribution,
      histogram,
      attention: {
        people_with_few_photos: peopleWithFewPhotos.slice(0, 10), // Лимит 10
        people_without_avatar: peopleWithoutAvatar.slice(0, 10),
        unknown_faces_count: unknownFaces,
        faces_without_descriptors: facesWithoutDescriptors || 0,
      },
      top_people: top5People,
      galleries: {
        fully_verified: galleriesFullyVerified,
        partially_verified: galleriesPartiallyVerified,
        not_processed: galleriesNotProcessed,
        total: galleries?.length || 0,
      },
      integrity: {
        inconsistent_verified_confidence: inconsistentCount || 0,
        orphaned_descriptors: orphanedDescriptorsCount || 0,
        avg_unverified_confidence: avgUnverifiedConfidence,
      },
    })
  } catch (error) {
    console.error("[v0] Error fetching face statistics:", error)
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 })
  }
}
