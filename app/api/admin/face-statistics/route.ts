import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()

  try {
    // Получаем все счётчики параллельно
    const [
      { count: totalPeopleCount },
      { count: totalPhotoFacesCount },
      { count: verifiedFacesCount },
      { data: peopleWithVerifiedFaces },
      { data: personStats },
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
      // Статистика по людям
      supabase
        .from("photo_faces")
        .select("person_id")
        .eq("verified", true)
        .not("person_id", "is", null),
    ])

    const totalPeople = totalPeopleCount || 0
    const totalFaces = totalPhotoFacesCount || 0
    const verifiedFaces = verifiedFacesCount || 0

    // Считаем уникальных людей с подтверждёнными фото
    const uniquePeopleWithVerified = new Set(peopleWithVerifiedFaces?.map((f) => f.person_id) || [])
    const peopleWithVerifiedCount = uniquePeopleWithVerified.size

    // Считаем распределение лиц по людям
    const personCounts =
      personStats?.reduce((acc: Record<string, number>, face) => {
        acc[face.person_id] = (acc[face.person_id] || 0) + 1
        return acc
      }, {}) || {}

    const faceCounts = Object.values(personCounts) as number[]
    const peopleWithFaces = faceCounts.length

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
          { face_range: "3-4 faces", people_count: 0, total_faces: 0 },
          { face_range: "5-9 faces", people_count: 0, total_faces: 0 },
          { face_range: "10-14 faces", people_count: 0, total_faces: 0 },
          { face_range: "15-19 faces", people_count: 0, total_faces: 0 },
          { face_range: "20+ faces", people_count: 0, total_faces: 0 },
        ],
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
        threshold: `>= ${threshold} faces`,
        people_count: peopleCount,
        total_faces: totalFacesForThreshold,
        percentage: ((peopleCount / peopleWithFaces) * 100).toFixed(1),
      }
    })

    // Histogram
    const histogram = [
      { range: "3-4 faces", min: 3, max: 4 },
      { range: "5-9 faces", min: 5, max: 9 },
      { range: "10-14 faces", min: 10, max: 14 },
      { range: "15-19 faces", min: 15, max: 19 },
      { range: "20+ faces", min: 20, max: 9999 },
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
    })
  } catch (error) {
    console.error("[v0] Error fetching face statistics:", error)
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 })
  }
}
