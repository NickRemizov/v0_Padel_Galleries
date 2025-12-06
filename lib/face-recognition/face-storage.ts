import type { SupabaseClient } from "@supabase/supabase-js"

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Check if it's a rate limit error (including SyntaxError from parsing "Too Many Requests")
      const isRateLimit =
        error?.message?.includes("Too Many") ||
        error?.message?.includes("SyntaxError") ||
        error?.code === "429" ||
        error?.status === 429 ||
        (error instanceof SyntaxError && error.message.includes("Too Many"))

      if (!isRateLimit || i === maxRetries - 1) {
        throw error
      }

      // More aggressive exponential backoff: 2s, 4s, 8s, 16s, 32s
      const delay = initialDelay * Math.pow(2, i)
      console.log(`[v0] Rate limited, retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

async function safeSupabaseCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error: any) {
    // If it's a SyntaxError with "Too Many" in message, it's a rate limit error
    if (error instanceof SyntaxError && error.message.includes("Too Many")) {
      const rateLimitError = new Error("Too Many Requests")
      ;(rateLimitError as any).status = 429
      throw rateLimitError
    }
    throw error
  }
}

export async function saveFaceDescriptor(
  supabase: SupabaseClient,
  personId: string,
  descriptor: Float32Array,
  sourceImageId: string | null,
) {
  return retryWithBackoff(async () => {
    return safeSupabaseCall(async () => {
      if (sourceImageId) {
        const { error: deleteError } = await supabase
          .from("face_descriptors")
          .delete()
          .eq("person_id", personId)
          .eq("source_image_id", sourceImageId)

        if (deleteError) {
          console.error("[v0] Error deleting old descriptors:", deleteError)
          // Don't throw - continue with insert even if delete fails
        } else {
          console.log(`[v0] Deleted old descriptors for person ${personId} on photo ${sourceImageId}`)
        }
      }

      const { data, error } = await supabase.from("face_descriptors").insert({
        person_id: personId,
        descriptor: Array.from(descriptor),
        source_image_id: sourceImageId,
      })

      if (error) {
        console.error("[v0] Error saving face descriptor:", error)
        throw error
      }

      console.log(`[v0] Saved new descriptor for person ${personId} on photo ${sourceImageId}`)
      return data
    })
  })
}

export async function getAllFaceDescriptors(supabase: SupabaseClient) {
  return retryWithBackoff(async () => {
    return safeSupabaseCall(async () => {
      const { data: descriptors, error: descriptorsError } = await supabase
        .from("face_descriptors")
        .select("id, person_id, descriptor, source_image_id")
        .order("created_at", { ascending: false })

      if (descriptorsError) {
        console.error("[v0] Error fetching face descriptors:", descriptorsError)
        throw descriptorsError
      }

      if (!descriptors || descriptors.length === 0) {
        return []
      }

      const personIds = [...new Set(descriptors.map((d) => d.person_id).filter(Boolean))]

      const { data: people, error: peopleError } = await supabase
        .from("people")
        .select("id, real_name")
        .in("id", personIds)

      if (peopleError) {
        console.error("[v0] Error fetching people:", peopleError)
        throw peopleError
      }

      const peopleMap = new Map(people?.map((p) => [p.id, p.real_name]) || [])

      return descriptors.map((item) => ({
        id: item.id,
        personId: item.person_id,
        personName: peopleMap.get(item.person_id) || "Unknown",
        descriptor: item.descriptor,
        sourceImageId: item.source_image_id || null,
      }))
    })
  })
}

export async function savePhotoFace(
  supabase: SupabaseClient,
  photoId: string,
  personId: string | null,
  boundingBox: { x: number; y: number; width: number; height: number },
  confidence: number | null,
  verified = false,
) {
  return retryWithBackoff(async () => {
    return safeSupabaseCall(async () => {
      const { data, error } = await supabase.from("photo_faces").insert({
        photo_id: photoId,
        person_id: personId,
        insightface_bbox: boundingBox,
        confidence,
        verified,
      })

      if (error) {
        console.error("[v0] Error saving photo face:", error)
        throw error
      }

      return data
    })
  })
}

export async function updatePhotoFace(
  supabase: SupabaseClient,
  faceId: string,
  updates: {
    person_id?: string | null
    verified?: boolean
  },
) {
  return retryWithBackoff(async () => {
    return safeSupabaseCall(async () => {
      const { data, error } = await supabase.from("photo_faces").update(updates).eq("id", faceId)

      if (error) {
        console.error("[v0] Error updating photo face:", error)
        throw error
      }

      return data
    })
  })
}

export async function getPhotoFaces(supabase: SupabaseClient, photoId: string) {
  return retryWithBackoff(async () => {
    return safeSupabaseCall(async () => {
      const { data: faces, error: facesError } = await supabase
        .from("photo_faces")
        .select("id, person_id, insightface_bbox, confidence, recognition_confidence, blur_score, verified")
        .eq("photo_id", photoId)

      if (facesError) {
        console.error("[v0] Error fetching photo faces:", facesError)
        throw facesError
      }

      if (!faces || faces.length === 0) {
        return []
      }

      const personIds = [...new Set(faces.map((f) => f.person_id).filter(Boolean))]

      if (personIds.length === 0) {
        return faces.map((face) => ({
          ...face,
          people: null,
        }))
      }

      const { data: people, error: peopleError } = await supabase
        .from("people")
        .select("id, real_name")
        .in("id", personIds)

      if (peopleError) {
        console.error("[v0] Error fetching people:", peopleError)
        throw peopleError
      }

      const peopleMap = new Map(people?.map((p) => [p.id, { id: p.id, real_name: p.real_name }]) || [])

      return faces.map((face) => ({
        ...face,
        people: face.person_id ? peopleMap.get(face.person_id) || null : null,
      }))
    })
  })
}

export async function deletePhotoFace(supabase: SupabaseClient, faceId: string) {
  return retryWithBackoff(async () => {
    return safeSupabaseCall(async () => {
      const { error } = await supabase.from("photo_faces").delete().eq("id", faceId)

      if (error) {
        console.error("[v0] Error deleting photo face:", error)
        throw error
      }
    })
  })
}
