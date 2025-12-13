import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ""
    const day = date.getDate().toString().padStart(2, "0")
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    return `${day}.${month}`
  } catch {
    return ""
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const searchParams = request.nextUrl.searchParams
  const topCount = Number.parseInt(searchParams.get("top") || "15", 10)

  try {
    // === Базовые подсчёты ===
    const [
      { count: totalPeopleCount },
      { count: totalPhotoFacesCount },
      { count: verifiedFacesCount },
      { count: unknownFacesCount },
      { count: totalImagesCount },
      { count: processedImagesCount },
    ] = await Promise.all([
      supabase.from("people").select("*", { count: "exact", head: true }),
      supabase.from("photo_faces").select("*", { count: "exact", head: true }),
      supabase.from("photo_faces").select("*", { count: "exact", head: true }).eq("verified", true),
      supabase.from("photo_faces").select("*", { count: "exact", head: true }).is("person_id", null),
      supabase.from("gallery_images").select("*", { count: "exact", head: true }),
      supabase.from("gallery_images").select("*", { count: "exact", head: true }).eq("has_been_processed", true),
    ])

    // === Игроки с/без verified фото ===
    const { data: peopleWithVerifiedFaces } = await supabase
      .from("photo_faces")
      .select("person_id")
      .eq("verified", true)
      .not("person_id", "is", null)

    const uniquePeopleWithVerified = new Set(peopleWithVerifiedFaces?.map((f) => f.person_id) || [])
    const peopleWithVerifiedCount = uniquePeopleWithVerified.size
    const peopleWithoutVerifiedCount = (totalPeopleCount || 0) - peopleWithVerifiedCount

    // Список людей без verified фото
    const { data: allPeople } = await supabase.from("people").select("id, real_name, telegram_name").order("real_name")

    const peopleWithoutVerifiedList = (allPeople || [])
      .filter((p) => !uniquePeopleWithVerified.has(p.id))
      .slice(0, 50)
      .map((p) => ({
        id: p.id,
        name: p.real_name || p.telegram_name || "Без имени",
      }))

    // === Подсчёт фото с N людьми ===
    const { data: facesPerPhoto } = await supabase.from("photo_faces").select("photo_id")

    const photoFaceCounts: Record<string, number> = {}
    for (const face of facesPerPhoto || []) {
      photoFaceCounts[face.photo_id] = (photoFaceCounts[face.photo_id] || 0) + 1
    }

    let with1Person = 0
    let with2_3Persons = 0
    let with4PlusPersons = 0

    for (const count of Object.values(photoFaceCounts)) {
      if (count === 1) with1Person++
      else if (count >= 2 && count <= 3) with2_3Persons++
      else if (count >= 4) with4PlusPersons++
    }

    // === Статистика фото на игрока ===
    const { data: verifiedFacesPerPerson } = await supabase
      .from("photo_faces")
      .select("person_id")
      .eq("verified", true)
      .not("person_id", "is", null)

    const personFaceCounts: Record<string, number> = {}
    for (const face of verifiedFacesPerPerson || []) {
      if (face.person_id) {
        personFaceCounts[face.person_id] = (personFaceCounts[face.person_id] || 0) + 1
      }
    }

    const faceCounts = Object.values(personFaceCounts)
    const playerStatsAvg =
      faceCounts.length > 0 ? (faceCounts.reduce((a, b) => a + b, 0) / faceCounts.length).toFixed(1) : "0"
    const playerStatsMin = faceCounts.length > 0 ? Math.min(...faceCounts) : 0
    const playerStatsMax = faceCounts.length > 0 ? Math.max(...faceCounts) : 0

    // === Статистика фото в галерее ===
    const { data: galleries } = await supabase.from("galleries").select(`
        id, 
        title, 
        shoot_date,
        gallery_images!inner (
          id,
          has_been_processed
        )
      `)

    const galleryPhotoCounts = (galleries || []).map((g) => (g.gallery_images as any[])?.length || 0)
    const galleryStatsAvg =
      galleryPhotoCounts.length > 0
        ? Math.round(galleryPhotoCounts.reduce((a, b) => a + b, 0) / galleryPhotoCounts.length)
        : 0
    const galleryStatsMin = galleryPhotoCounts.length > 0 ? Math.min(...galleryPhotoCounts) : 0
    const galleryStatsMax = galleryPhotoCounts.length > 0 ? Math.max(...galleryPhotoCounts) : 0

    // === Требуют внимания: игроки с 1-2 фото ===
    const fewPhotosList = Object.entries(personFaceCounts)
      .filter(([, count]) => count >= 1 && count <= 2)
      .map(([personId, count]) => {
        const person = allPeople?.find((p) => p.id === personId)
        return {
          id: personId,
          name: person?.real_name || person?.telegram_name || "Без имени",
          count,
        }
      })
      .sort((a, b) => a.count - b.count)

    // === Требуют внимания: без аватара ===
    const { data: peopleWithoutAvatar } = await supabase
      .from("people")
      .select("id, real_name, telegram_name")
      .is("avatar_url", null)
      .limit(50)

    const noAvatarList = (peopleWithoutAvatar || []).map((p) => ({
      id: p.id,
      name: p.real_name || p.telegram_name || "Без имени",
    }))

    // === Топ игроков ===
    const topPlayers = Object.entries(personFaceCounts)
      .map(([personId, count]) => {
        const person = allPeople?.find((p) => p.id === personId)
        return {
          id: personId,
          name: person?.real_name || person?.telegram_name || "Без имени",
          count,
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, topCount)

    // === Состояние галерей ===
    const fullyVerifiedList: Array<{ id: string; title: string; date: string; photos: number }> = []
    const partiallyVerifiedList: Array<{ id: string; title: string; date: string; processed: number; total: number }> =
      []
    const notProcessedList: Array<{ id: string; title: string; date: string; photos: number }> = []

    for (const gallery of galleries || []) {
      const images = (gallery.gallery_images as any[]) || []
      const total = images.length
      const processed = images.filter((img: any) => img.has_been_processed).length
      const date = formatShortDate(gallery.shoot_date)

      if (total === 0) {
        notProcessedList.push({ id: gallery.id, title: gallery.title, date, photos: 0 })
      } else if (processed === 0) {
        notProcessedList.push({ id: gallery.id, title: gallery.title, date, photos: total })
      } else if (processed === total) {
        fullyVerifiedList.push({ id: gallery.id, title: gallery.title, date, photos: total })
      } else {
        partiallyVerifiedList.push({ id: gallery.id, title: gallery.title, date, processed, total })
      }
    }

    // === Целостность ===
    const { count: inconsistentCount } = await supabase
      .from("photo_faces")
      .select("*", { count: "exact", head: true })
      .eq("verified", true)
      .neq("recognition_confidence", 1)

    let orphanedDescriptorsCount = 0
    try {
      const { count } = await supabase.rpc("count_orphaned_descriptors")
      orphanedDescriptorsCount = count || 0
    } catch {
      // Fallback если RPC не существует
    }

    const { data: unverifiedConfidences } = await supabase
      .from("photo_faces")
      .select("recognition_confidence")
      .eq("verified", false)
      .not("person_id", "is", null)
      .not("recognition_confidence", "is", null)
      .limit(1000)

    let avgUnverifiedConfidence = 0
    if (unverifiedConfidences && unverifiedConfidences.length > 0) {
      const sum = unverifiedConfidences.reduce((acc, f) => acc + (f.recognition_confidence || 0), 0)
      avgUnverifiedConfidence = sum / unverifiedConfidences.length
    }

    // === Распределение (кумулятивное) ===
    const thresholds = [1, 3, 5, 10, 20, 40]
    const distribution = thresholds.map((threshold) => {
      const count = faceCounts.filter((c) => c >= threshold).length
      const percentage = faceCounts.length > 0 ? Math.round((count / faceCounts.length) * 100) : 0
      return { threshold, count, percentage }
    })

    // === Гистограмма ===
    const histogramBuckets = [
      { range: "1-2", min: 1, max: 2 },
      { range: "3-4", min: 3, max: 4 },
      { range: "5-9", min: 5, max: 9 },
      { range: "10-19", min: 10, max: 19 },
      { range: "20-39", min: 20, max: 39 },
      { range: "40+", min: 40, max: 9999 },
    ]

    const histogram = histogramBuckets.map((bucket) => {
      const peopleInBucket = faceCounts.filter((c) => c >= bucket.min && c <= bucket.max)
      return {
        range: bucket.range,
        count: peopleInBucket.length,
        total_faces: peopleInBucket.reduce((sum, c) => sum + c, 0),
      }
    })

    // === Формируем ответ ===
    return NextResponse.json({
      players: {
        total: totalPeopleCount || 0,
        with_verified: peopleWithVerifiedCount,
        without_verified: peopleWithoutVerifiedCount,
        without_verified_list: peopleWithoutVerifiedList,
      },
      faces: {
        total: totalPhotoFacesCount || 0,
        verified: verifiedFacesCount || 0,
        unverified: (totalPhotoFacesCount || 0) - (verifiedFacesCount || 0),
      },
      images: {
        total: totalImagesCount || 0,
        recognized: processedImagesCount || 0,
        with_1_person: with1Person,
        with_2_3_persons: with2_3Persons,
        with_4_plus_persons: with4PlusPersons,
      },
      player_stats: {
        avg_photos: Number.parseFloat(playerStatsAvg),
        min_photos: playerStatsMin,
        max_photos: playerStatsMax,
      },
      gallery_stats: {
        avg_photos: galleryStatsAvg,
        min_photos: galleryStatsMin,
        max_photos: galleryStatsMax,
      },
      attention: {
        few_photos_count: fewPhotosList.length,
        few_photos_list: fewPhotosList,
        no_avatar_count: noAvatarList.length,
        no_avatar_list: noAvatarList,
        unknown_faces: unknownFacesCount || 0,
      },
      top_players: topPlayers,
      galleries: {
        total: (galleries || []).length,
        fully_verified: fullyVerifiedList.length,
        fully_verified_list: fullyVerifiedList,
        partially_verified: partiallyVerifiedList.length,
        partially_verified_list: partiallyVerifiedList,
        not_processed: notProcessedList.length,
        not_processed_list: notProcessedList,
      },
      integrity: {
        inconsistent_verified: inconsistentCount || 0,
        orphaned_descriptors: orphanedDescriptorsCount,
        avg_unverified_confidence: avgUnverifiedConfidence,
      },
      distribution,
      histogram,
    })
  } catch (error) {
    console.error("[v0] Error fetching face statistics:", error)
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 })
  }
}
