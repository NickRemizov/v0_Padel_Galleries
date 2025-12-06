import { createClient } from "@/lib/supabase/server"
import { AddPersonDialog } from "./add-person-dialog"
import { PersonList } from "./person-list"
import type { Person } from "@/lib/types"

type PersonWithStats = Person & {
  verified_photos_count: number
  high_confidence_photos_count: number
  descriptor_count: number
}

export async function PeopleManager() {
  const supabase = await createClient()

  const { data: configData } = await supabase.from("face_training_config").select("settings").eq("id", 1).single()

  const confidenceThreshold = configData?.settings?.confidence_thresholds?.high_data ?? 0.6
  // </CHANGE>

  const { data: people } = await supabase.from("people").select("*").order("real_name", { ascending: true })

  let allPhotoFaces: Array<{
    person_id: string
    photo_id: string
    verified: boolean | null
    recognition_confidence: number | null
  }> = []
  // </CHANGE>

  const pageSize = 1000
  let page = 0
  let hasMore = true

  while (hasMore) {
    const from = page * pageSize
    const to = from + pageSize - 1

    const { data: pageData } = await supabase
      .from("photo_faces")
      .select("person_id, photo_id, verified, recognition_confidence")
      .range(from, to)
    // </CHANGE>

    if (pageData && pageData.length > 0) {
      allPhotoFaces = [...allPhotoFaces, ...pageData]
      page++

      if (pageData.length < pageSize) {
        hasMore = false
      }
    } else {
      hasMore = false
    }
  }

  let allDescriptors: Array<{ person_id: string }> = []
  let descriptorPage = 0
  let hasMoreDescriptors = true

  while (hasMoreDescriptors) {
    const from = descriptorPage * pageSize
    const to = from + pageSize - 1

    const { data: descriptorPageData } = await supabase.from("face_descriptors").select("person_id").range(from, to)

    if (descriptorPageData && descriptorPageData.length > 0) {
      allDescriptors = [...allDescriptors, ...descriptorPageData]
      descriptorPage++

      if (descriptorPageData.length < pageSize) {
        hasMoreDescriptors = false
      }
    } else {
      hasMoreDescriptors = false
    }
  }

  const descriptorCountMap = new Map<string, number>()
  for (const descriptor of allDescriptors) {
    descriptorCountMap.set(descriptor.person_id, (descriptorCountMap.get(descriptor.person_id) || 0) + 1)
  }

  const peopleWithStats: PersonWithStats[] = (people || []).map((person) => {
    const personFaces = allPhotoFaces.filter((face) => face.person_id === person.id)

    const photoIdsMap = new Map<string, { hasVerified: boolean; hasHighConfidence: boolean }>()

    for (const face of personFaces) {
      const meetsDisplayCriteria =
        face.verified === true ||
        (face.recognition_confidence !== null && face.recognition_confidence >= confidenceThreshold)
      // </CHANGE>

      if (!meetsDisplayCriteria) {
        continue
      }

      if (!photoIdsMap.has(face.photo_id)) {
        photoIdsMap.set(face.photo_id, { hasVerified: false, hasHighConfidence: false })
      }

      const photoData = photoIdsMap.get(face.photo_id)!

      if (face.verified === true) {
        photoData.hasVerified = true
      }

      if (face.recognition_confidence !== null && face.recognition_confidence >= confidenceThreshold) {
        photoData.hasHighConfidence = true
      }
      // </CHANGE>
    }

    const verifiedPhotosCount = Array.from(photoIdsMap.values()).filter((data) => data.hasVerified).length

    const highConfidencePhotosCount = Array.from(photoIdsMap.values()).filter(
      (data) => !data.hasVerified && data.hasHighConfidence,
    ).length

    return {
      ...person,
      verified_photos_count: verifiedPhotosCount,
      high_confidence_photos_count: highConfidencePhotosCount,
      descriptor_count: descriptorCountMap.get(person.id) || 0,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Люди</h2>
          <p className="text-muted-foreground">Управление базой людей для распознавания лиц</p>
        </div>
        <div className="flex gap-2">
          <AddPersonDialog />
        </div>
      </div>

      <PersonList people={peopleWithStats} />
    </div>
  )
}
