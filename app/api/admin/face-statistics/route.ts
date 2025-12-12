import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

interface PersonWithStats {
  id: string
  real_name: string
  telegram_name?: string
  avatar_url?: string
  verified_photos_count?: number
  high_confidence_photos_count?: number
  descriptor_count?: number
}

export async function GET() {
  const supabase = await createClient()

  try {
    let peopleWithStats: PersonWithStats[] = []
    try {
      const fastapiUrl = process.env.FASTAPI_URL || "http://localhost:8000"
      const response = await fetch(`${fastapiUrl}/api/people?with_stats=true`, {
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      })
      if (response.ok) {
        const result = await response.json()
        peopleWithStats = result.data || []
      }
    } catch (e) {
      console.error("[v0] Error fetching people stats from FastAPI:", e)
    }

    const [
      { count: totalPeopleCount },
      { count: totalPhotoFacesCount },
      { count: verifiedFacesCount },
      { data: peopleWithVerifiedFaces },
      { count: unknownFacesCount },
      { data: galleries },
      { count: inconsistentCount },
      { data: facesWithoutDescriptors },
    ] = await Promise.all([
      supabase.from("people").select("*", { count: "exact", head: true }),
      supabase.from("photo_faces").select("*", { count: "exact", head: true }),
      supabase.from("photo_faces").select("*", { count: "exact", head: true }).eq("verified", true),
      supabase.from("photo_faces").select("person_id").eq("verified", true).not("person_id", "is", null),
      supabase.from("photo_faces").select("*", { count: "exact", head: true }).is("person_id", null),
      supabase.from("galleries").select("id, title"),
      supabase
        .from("photo_faces")
        .select("*", { count: "exact", head: true })
        .eq("verified", true)
        .neq("recognition_confidence", 1),
      supabase
        .from("photo_faces")
        .select("id", { count: "exact", head: true })
        .not("person_id", "is", null)
        .is("insightface_descriptor", null),
    ])

    let orphanedDescriptorsCount = 0
    try {
      const { count } = await supabase.rpc("count_orphaned_descriptors")
      orphanedDescriptorsCount = count || 0
    } catch (e) {
      const { data: orphaned } = await supabase.from("photo_faces").select("id, photo_id")
      if (orphaned) {
        const { data: existingPhotos } = await supabase.from("gallery_images").select("id")
        const existingIds = new Set(existingPhotos?.map((p) => p.id) || [])
        orphanedDescriptorsCount = orphaned.filter((f) => !existingIds.has(f.photo_id)).length
      }
    }

    const totalPeople = totalPeopleCount || 0
    const totalFaces = totalPhotoFacesCount || 0
    const verifiedFaces = verifiedFacesCount || 0
    const unknownFaces = unknownFacesCount || 0

    const uniquePeopleWithVerified = new Set(peopleWithVerifiedFaces?.map((f) => f.person_id) || [])
    const peopleWithVerifiedCount = uniquePeopleWithVerified.size

    const peopleWithFewPhotos = peopleWithStats
      .filter((p) => (p.verified_photos_count || 0) > 0 && (p.verified_photos_count || 0) < 3)
      .map((p) => ({
        id: p.id,
        name: p.real_name || p.telegram_name || "Без имени",
        count: p.verified_photos_count || 0,
      }))
      .sort((a, b) => a.count - b.count)

    const peopleWithoutAvatar = peopleWithStats
      .filter((p) => !p.avatar_url)
      .map((p) => ({
        id: p.id,
        name: p.real_name || p.telegram_name || "Без имени",
      }))

    const top5People = peopleWithStats
      .filter((p) => (p.verified_photos_count || 0) > 0)
      .map((p) => ({
        id: p.id,
        name: p.real_name || p.telegram_name || "Без имени",
        count: p.verified_photos_count || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const faceCounts = peopleWithStats
      .filter((p) => (p.verified_photos_count || 0) > 0)
      .map((p) => p.verified_photos_count || 0)

    const peopleWithFaces = faceCounts.length

    let galleriesFullyVerified = 0
    let galleriesPartiallyVerified = 0
    let galleriesNotProcessed = 0

    if (galleries && galleries.length > 0) {
      const { data: galleryStats } = await supabase.from("galleries").select(`
          id,
          gallery_images!inner (
            id,
            has_been_processed
          )
        `)

      for (const gallery of galleryStats || []) {
        const images = (gallery.gallery_images as any[]) || []
        if (images.length === 0) {
          galleriesNotProcessed++
          continue
        }

        const processedCount = images.filter((img: any) => img.has_been_processed).length

        if (processedCount === 0) {
          galleriesNotProcessed++
        } else if (processedCount === images.length) {
          galleriesFullyVerified++
        } else {
          galleriesPartiallyVerified++
        }
      }
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
        min_faces: faceCounts.length > 0 ? Math.min(...faceCounts) : 0,
        max_faces: faceCounts.length > 0 ? Math.max(...faceCounts) : 0,
      },
      distribution,
      histogram,
      attention: {
        people_with_few_photos: peopleWithFewPhotos.slice(0, 10),
        people_without_avatar: peopleWithoutAvatar.slice(0, 10),
        unknown_faces_count: unknownFaces,
        faces_without_descriptors: Array.isArray(facesWithoutDescriptors) ? facesWithoutDescriptors.length : 0,
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
        orphaned_descriptors: orphanedDescriptorsCount,
        avg_unverified_confidence: avgUnverifiedConfidence,
      },
    })
  } catch (error) {
    console.error("[v0] Error fetching face statistics:", error)
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 })
  }
}
