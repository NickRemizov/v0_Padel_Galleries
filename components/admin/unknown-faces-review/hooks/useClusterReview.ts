"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import type { Person } from "@/lib/types"
import type { Cluster, ClusterFace, BestFaceForAvatar } from "../types"
import { clusterUnknownFacesAction, assignFacesToPersonAction, markPhotoAsProcessedAction } from "@/app/admin/actions/faces"
import { getPeopleAction } from "@/app/admin/actions/entities"
import { rejectFaceClusterAction } from "@/app/admin/actions/recognition"

interface UseClusterReviewProps {
  galleryId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

export function useClusterReview({ galleryId, open, onOpenChange, onComplete }: UseClusterReviewProps) {
  const [loading, setLoading] = useState(false)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [currentClusterIndex, setCurrentClusterIndex] = useState(0)
  const [people, setPeople] = useState<Person[]>([])
  const [processing, setProcessing] = useState(false)
  const [removedFaces, setRemovedFaces] = useState<Set<string>>(new Set())
  const [minGridHeight, setMinGridHeight] = useState<number | null>(null)

  // Load clusters on open
  const loadClusters = useCallback(async () => {
    setLoading(true)
    try {
      console.log("[UnknownFacesDialog] Loading clusters for gallery:", galleryId)
      const result = await clusterUnknownFacesAction(galleryId)
      if (result.success && result.data) {
        const loadedClusters = result.data.clusters || []
        setClusters(loadedClusters)
        setCurrentClusterIndex(0)
        console.log("[UnknownFacesDialog] Loaded", loadedClusters.length, "clusters")
        if (loadedClusters.length > 0) {
          const maxFaces = loadedClusters[0].faces.length
          const rows = Math.ceil(maxFaces / 4)
          setMinGridHeight(rows * 216)
        }
      }
    } catch (error) {
      console.error("[UnknownFacesReview] Error loading clusters:", error)
    } finally {
      setLoading(false)
    }
  }, [galleryId])

  // Load people list
  const loadPeople = useCallback(async () => {
    const result = await getPeopleAction()
    if (result.success && result.data) {
      setPeople(result.data)
    }
  }, [])


  // Initialize on open
  useEffect(() => {
    if (open) {
      loadClusters()
      loadPeople()
      setRemovedFaces(new Set())
      setMinGridHeight(null)
    }
  }, [open, galleryId, loadClusters, loadPeople])

  // Reset removed faces on cluster change
  useEffect(() => {
    setRemovedFaces(new Set())
  }, [currentClusterIndex])

  // Move to next cluster or close dialog
  const moveToNextCluster = useCallback(() => {
    setRemovedFaces(new Set())
    if (currentClusterIndex + 1 >= clusters.length) {
      onOpenChange(false)
      onComplete?.()
    } else {
      setCurrentClusterIndex(currentClusterIndex + 1)
    }
  }, [currentClusterIndex, clusters.length, onOpenChange, onComplete])

  // Assign cluster to person
  const assignClusterToPerson = useCallback(async (personId: string) => {
    if (clusters.length === 0 || currentClusterIndex >= clusters.length) return
    
    const currentCluster = clusters[currentClusterIndex]
    const facesToAssign = currentCluster.faces.filter((f) => !removedFaces.has(f.id))
    const faceIds = facesToAssign.map((f) => f.id)
    
    setProcessing(true)
    try {
      const result = await assignFacesToPersonAction(faceIds, personId)
      if (result.success) {
        const uniquePhotoIds = [...new Set(facesToAssign.map((f) => f.photo_id))]
        console.log("[UnknownFacesReview] Marking", uniquePhotoIds.length, "photos as processed")
        for (const photoId of uniquePhotoIds) {
          await markPhotoAsProcessedAction(photoId)
        }
        moveToNextCluster()
      }
    } catch (error) {
      console.error("[UnknownFacesReview] Error assigning faces:", error)
    } finally {
      setProcessing(false)
    }
  }, [clusters, currentClusterIndex, removedFaces, moveToNextCluster])

  // Reject (delete) cluster
  const rejectCluster = useCallback(async () => {
    if (clusters.length === 0 || currentClusterIndex >= clusters.length) return
    
    const currentCluster = clusters[currentClusterIndex]
    const facesToReject = currentCluster.faces.filter((f) => !removedFaces.has(f.id))
    const faceIds = facesToReject.map((f) => f.id)
    
    if (faceIds.length === 0) {
      moveToNextCluster()
      return
    }
    
    setProcessing(true)
    try {
      console.log("[UnknownFacesReview] Rejecting cluster with", faceIds.length, "faces")
      const result = await rejectFaceClusterAction(faceIds)
      if (result.success) {
        console.log("[UnknownFacesReview] Successfully rejected", result.deleted, "faces")
        moveToNextCluster()
      } else {
        console.error("[UnknownFacesReview] Error rejecting cluster:", result.error)
      }
    } catch (error) {
      console.error("[UnknownFacesReview] Error rejecting cluster:", error)
    } finally {
      setProcessing(false)
    }
  }, [clusters, currentClusterIndex, removedFaces, moveToNextCluster])

  // Navigation
  const goToPreviousCluster = useCallback(() => {
    if (currentClusterIndex > 0) {
      setRemovedFaces(new Set())
      setCurrentClusterIndex(currentClusterIndex - 1)
    }
  }, [currentClusterIndex])

  const goToNextCluster = useCallback(() => {
    if (currentClusterIndex + 1 < clusters.length) {
      setRemovedFaces(new Set())
      setCurrentClusterIndex(currentClusterIndex + 1)
    }
  }, [currentClusterIndex, clusters.length])

  // Remove face from current cluster view
  const removeFace = useCallback((faceId: string) => {
    setRemovedFaces((prev) => new Set(prev).add(faceId))
  }, [])

  // Current cluster data
  const currentCluster = clusters[currentClusterIndex]
  const visibleFaces = currentCluster?.faces.filter((f) => !removedFaces.has(f.id)) || []
  const hasPreviousCluster = currentClusterIndex > 0
  const hasNextCluster = currentClusterIndex + 1 < clusters.length

  // Best face for avatar generation (first visible face)
  const bestFaceForAvatar = useMemo((): BestFaceForAvatar | null => {
    if (!visibleFaces.length) return null
    const face = visibleFaces[0]
    return { image_url: face.image_url, bbox: face.bbox }
  }, [visibleFaces])

  return {
    loading,
    processing,
    clusters,
    currentCluster,
    currentClusterIndex,
    visibleFaces,
    people,
    minGridHeight,
    hasPreviousCluster,
    hasNextCluster,
    bestFaceForAvatar,
    loadPeople,
    assignClusterToPerson,
    rejectCluster,
    goToPreviousCluster,
    goToNextCluster,
    removeFace,
  }
}
