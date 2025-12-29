import { createClient } from "@/lib/supabase/server"

/**
 * Получить порог confidence из настроек
 */
export async function getConfidenceThreshold(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("face_recognition_config")
      .select("value")
      .eq("key", "recognition_settings")
      .single()

    if (data?.value?.confidence_thresholds?.high_data) {
      return data.value.confidence_thresholds.high_data
    }
  } catch (error) {
    console.error("[integrity] Failed to get config:", error)
  }
  return 0.6 // fallback
}

/**
 * Helper: загрузить все записи из photo_faces с пагинацией
 */
export async function loadAllPhotoFaces<T>(
  supabase: any,
  selectFields: string,
  filters?: (query: any) => any
): Promise<T[]> {
  let allRecords: T[] = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    let query = supabase
      .from("photo_faces")
      .select(selectFields)
      .range(offset, offset + pageSize - 1)

    if (filters) {
      query = filters(query)
    }

    const { data: batch } = await query

    if (!batch || batch.length === 0) break
    allRecords = allRecords.concat(batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return allRecords
}
