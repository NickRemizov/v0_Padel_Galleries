"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { assignFacesToPersonAction, markPhotoAsProcessedAction } from "@/app/admin/actions/faces"
import { getPeopleAction } from "@/app/admin/actions/entities"
import { clusterAllUnknownFacesAction, rejectFaceClusterAction } from "@/app/admin/actions/recognition"
import type { Person } from "@/lib/types"
import type { Cluster, ClusterFace, BestFaceForAvatar } from "./types"

export function useClusterNavigation(open: boolean, onComplete?: () => void, onClose?: () => void) {
  const [loading, setLoading] = useState(false)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [currentClusterIndex, setCurrentClusterIndex] = useState(0)
  const [people, setPeople] = useState<Person[]>([])
  const [processing, setProcessing] = useState(false)
  const [removedFaces, setRemovedFaces] = useState<Set<string>>(new Set())
  const [autoAvatarEnabled, setAutoAvatarEnabled] = useState(true)
  const [minGridHeight, setMinGridHeight] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      loadClusters()
      loadPeople()
      loadConfig()
      setRemovedFaces(new Set())
      setCurrentClusterIndex(0)
      setMinGridHeight(null)
    }
  }, [open])

  useEffect(() => {
    setRemovedFaces(new Set())
  }, [currentClusterIndex])

  async function loadConfig() {
    try {
      const response = await fetch("/api/admin/training/config")
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setAutoAvatarEnabled(result.data.auto_avatar_on_create ?? true)
        }
      }
    } catch (error) {
      console.error("[GlobalUnknownFaces] Error loading config:", error)
    }
  }

  async function loadClusters() {
    setLoading(true)
    try {
      const result = await clusterAllUnknownFacesAction()
      if (result.success && result.data) {
        const loadedClusters = result.data.clusters || []
        setClusters(loadedClusters)
        setCurrentClusterIndex(0)
        if (loadedClusters.length > 0) {
          const maxFaces = loadedClusters[0].faces.length
          const rows = Math.ceil(maxFaces / 4)
          setMinGridHeight(rows * 216)
        }
      }
    } catch (error) {
      console.error("[GlobalUnknownFaces] Error loading clusters:", error)
    } finally {
      setLoading(false)
    }
  }

  async function loadPeople() {
    const result = await getPeopleAction()
    if (result.success && result.data) {
      setPeople(result.data)
    }
  }

  const currentCluster = clusters[currentClusterIndex]
  const visibleFaces = currentCluster?.faces.filter((f) => !removedFaces.has(f.id)) || []
  const hasPreviousCluster = currentClusterIndex > 0
  const hasNextCluster = currentClusterIndex + 1 < clusters.length

  const bestFaceForAvatar = useMemo((): BestFaceForAvatar | null => {
    if (!visibleFaces.length) return null
    const face = visibleFaces[0]
    return { image_url: face.image_url, bbox: face.bbox as BestFaceForAvatar["bbox"] }
  }, [visibleFaces])

  const moveToNextCluster = useCallback(() => {
    setRemovedFaces(new Set())
    if (currentClusterIndex + 1 >= clusters.length) {
      onClose?.()
      onComplete?.()
    } else {
      setCurrentClusterIndex(currentClusterIndex + 1)
    }
  }, [currentClusterIndex, clusters.length, onClose, onComplete])

  const handlePreviousCluster = useCallback(() => {
    if (hasPreviousCluster) {
      setRemovedFaces(new Set())
      setCurrentClusterIndex(currentClusterIndex - 1)
    }
  }, [hasPreviousCluster, currentClusterIndex])

  const handleNextCluster = useCallback(() => {
    if (hasNextCluster) {
      setRemovedFaces(new Set())
      setCurrentClusterIndex(currentClusterIndex + 1)
    }
  }, [hasNextCluster, currentClusterIndex])

  const handleRemoveFace = useCallback((faceId: string) => {
    setRemovedFaces((prev) => new Set(prev).add(faceId))
  }, [])

  const assignClusterToPerson = useCallback(async (personId: string) => {
    if (!currentCluster) return
    const facesToAssign = currentCluster.faces.filter((f) => !removedFaces.has(f.id))
    const faceIds = facesToAssign.map((f) => f.id)
    setProcessing(true)
    try {
      const result = await assignFacesToPersonAction(faceIds, personId)
      if (result.success) {
        const uniquePhotoIds = [...new Set(facesToAssign.map((f) => f.photo_id))]
        for (const photoId of uniquePhotoIds) {
          await markPhotoAsProcessedAction(photoId)
        }
        moveToNextCluster()
      }
    } catch (error) {
      console.error("[GlobalUnknownFaces] Error assigning faces:", error)
    } finally {
      setProcessing(false)
    }
  }, [currentCluster, removedFaces, moveToNextCluster])

  const handleRejectCluster = useCallback(async () => {
    if (!currentCluster) return
    const facesToReject = currentCluster.faces.filter((f) => !removedFaces.has(f.id))
    const faceIds = facesToReject.map((f) => f.id)
    if (faceIds.length === 0) {
      moveToNextCluster()
      return
    }
    setProcessing(true)
    try {
      const result = await rejectFaceClusterAction(faceIds)
      if (result.success) {
        moveToNextCluster()
      } else {
        console.error("[GlobalUnknownFaces] Error rejecting cluster:", result.error)
      }
    } catch (error) {
      console.error("[GlobalUnknownFaces] Error rejecting cluster:", error)
    } finally {
      setProcessing(false)
    }
  }, [currentCluster, removedFaces, moveToNextCluster])

  return {
    loading,
    clusters,
    currentClusterIndex,
    currentCluster,
    visibleFaces,
    people,
    processing,
    autoAvatarEnabled,
    minGridHeight,
    bestFaceForAvatar,
    hasPreviousCluster,
    hasNextCluster,
    loadPeople,
    handlePreviousCluster,
    handleNextCluster,
    handleRemoveFace,
    handleRejectCluster,
    assignClusterToPerson,
  }
}
