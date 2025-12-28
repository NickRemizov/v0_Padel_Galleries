"use client"

import { useState, useCallback } from "react"
import type { TaggedFace, Person } from "@/lib/types"
import type { DetailedFace } from "../types"
import { processPhotoAction, batchVerifyFacesAction, markPhotoAsProcessedAction } from "@/app/admin/actions/faces"
import { getPeopleAction } from "@/app/admin/actions/entities"
import { APP_VERSION } from "@/lib/version"

interface UseFaceAPIProps {
  imageId: string
  onSave?: (imageId: string, faces: TaggedFace[], indexRebuilt?: boolean) => void
}

/**
 * Hook for face tagging API operations
 */
export function useFaceAPI({ imageId, onSave }: UseFaceAPIProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [saving, setSaving] = useState(false)
  const [redetecting, setRedetecting] = useState(false)
  const [loadingFaces, setLoadingFaces] = useState(false)

  const loadPeople = useCallback(async () => {
    const result = await getPeopleAction()
    if (result.success && result.data) {
      setPeople(result.data)
    }
  }, [])

  const loadFacesForImage = useCallback(async (
    targetImageId: string,
    currentImageIdRef: React.MutableRefObject<string>
  ): Promise<TaggedFace[]> => {
    console.log(`[${APP_VERSION}] Loading faces for ${targetImageId}`)
    setLoadingFaces(true)
    
    try {
      // Backend v2.2 handles both cases automatically:
      // - No faces in DB → detect + recognize (CASE 1)
      // - Faces exist → recognize unverified (CASE 2)
      const result = await processPhotoAction(targetImageId, false, true)

      if (currentImageIdRef.current !== targetImageId) {
        console.log(`[${APP_VERSION}] Image changed during load, ignoring`)
        return []
      }

      if (!result.success || !result.faces) {
        console.log(`[${APP_VERSION}] No faces for ${targetImageId}`)
        setLoadingFaces(false)
        return []
      }

      const tagged: TaggedFace[] = result.faces.map((f: any) => ({
        id: f.id,
        face: {
          boundingBox: f.insightface_bbox,
          confidence: f.insightface_det_score,
          blur_score: 0,
          embedding: null,
        },
        personId: f.person_id,
        personName: f.people?.real_name || f.people?.telegram_name || null,
        recognitionConfidence: f.recognition_confidence,
        verified: f.verified,
      }))

      console.log(`[${APP_VERSION}] Loaded ${tagged.length} faces for ${targetImageId}`)
      setLoadingFaces(false)
      return tagged
    } catch (error) {
      console.error(`[${APP_VERSION}] Error loading faces:`, error)
      setLoadingFaces(false)
      return []
    }
  }, [])

  const redetectFaces = useCallback(async (
    targetImageId: string
  ): Promise<{ tagged: TaggedFace[]; detailed: DetailedFace[] }> => {
    if (redetecting) return { tagged: [], detailed: [] }
    
    setRedetecting(true)
    try {
      // Re-detect WITHOUT quality filters (force_redetect=true, apply_quality_filters=false)
      const result = await processPhotoAction(targetImageId, true, false)
      
      if (!result.success || !result.faces) {
        throw new Error(result.error || "Failed to redetect faces")
      }

      const tagged: TaggedFace[] = result.faces.map((f: any) => {
        if (f.person_id && f.people) {
          return {
            id: f.id,
            face: { boundingBox: f.insightface_bbox, confidence: f.insightface_det_score, blur_score: 0, embedding: null },
            personId: f.person_id,
            personName: f.people.real_name || f.people.telegram_name || null,
            recognitionConfidence: f.recognition_confidence,
            verified: f.verified,
          }
        }
        
        const topMatch = f.top_matches?.[0]
        const similarity = topMatch?.similarity || 0
        
        if (similarity > 0.3 && topMatch) {
          return {
            id: f.id,
            face: { boundingBox: f.insightface_bbox, confidence: f.insightface_det_score, blur_score: 0, embedding: null },
            personId: topMatch.person_id || null,
            personName: topMatch.name || null,
            recognitionConfidence: similarity,
            verified: false,
          }
        }
        
        return {
          id: f.id,
          face: { boundingBox: f.insightface_bbox, confidence: f.insightface_det_score, blur_score: 0, embedding: null },
          personId: null,
          personName: null,
          recognitionConfidence: similarity,
          verified: false,
        }
      })

      const detailed: DetailedFace[] = result.faces.map((f: any) => {
        const topMatch = f.top_matches?.[0]
        const similarity = topMatch?.similarity || 0
        let personName = f.people?.real_name || f.people?.telegram_name || null
        if (!personName && similarity > 0.3 && topMatch) {
          personName = topMatch.name || null
        }
        return {
          boundingBox: f.insightface_bbox,
          size: Math.max(f.insightface_bbox.width, f.insightface_bbox.height),
          blur_score: f.blur_score,
          detection_score: f.insightface_det_score,
          recognition_confidence: f.recognition_confidence,
          embedding_quality: f.embedding_quality,
          distance_to_nearest: f.distance_to_nearest,
          top_matches: f.top_matches,
          person_name: personName,
        }
      })

      setRedetecting(false)
      return { tagged, detailed }
    } catch (error) {
      console.error(`[${APP_VERSION}] Error redetecting:`, error)
      setRedetecting(false)
      throw error
    }
  }, [redetecting])

  const saveFaces = useCallback(async (
    targetImageId: string,
    taggedFaces: TaggedFace[],
    closeAfterSave: boolean,
    onOpenChange?: (open: boolean) => void,
    justSavedRef?: React.MutableRefObject<boolean>
  ): Promise<TaggedFace[] | null> => {
    if (saving) return null
    
    setSaving(true)
    try {
      const keptFaces = taggedFaces.map((face) => ({ id: face.id, person_id: face.personId }))
      const result = await batchVerifyFacesAction(targetImageId, keptFaces)
      
      if (!result.success) {
        alert(`\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f: ${result.error}`)
        setSaving(false)
        return null
      }

      await markPhotoAsProcessedAction(targetImageId)

      const updatedFaces = taggedFaces.map(face => ({
        ...face,
        verified: face.personId ? true : face.verified
      }))

      const indexRebuilt = result.verified === true || (result as any).index_rebuilt === true
      onSave?.(targetImageId, updatedFaces, indexRebuilt)

      if (closeAfterSave) {
        if (justSavedRef) justSavedRef.current = true
        onOpenChange?.(false)
      }

      setSaving(false)
      return updatedFaces
    } catch (error) {
      console.error(`[${APP_VERSION}] Error saving:`, error)
      alert(`\u041e\u0448\u0438\u0431\u043a\u0430: ${error instanceof Error ? error.message : String(error)}`)
      setSaving(false)
      return null
    }
  }, [saving, onSave])

  return {
    people,
    setPeople,
    saving,
    redetecting,
    loadingFaces,
    loadPeople,
    loadFacesForImage,
    redetectFaces,
    saveFaces,
  }
}
