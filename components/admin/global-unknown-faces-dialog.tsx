"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, UserPlus, Users, ChevronLeft, ChevronRight, X, Trash2 } from "lucide-react"
import { AddPersonDialog } from "./add-person-dialog"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { assignFacesToPersonAction, markPhotoAsProcessedAction } from "@/app/admin/actions/faces"
import { getPeopleAction } from "@/app/admin/actions/entities"
import { clusterAllUnknownFacesAction, rejectFaceClusterAction } from "@/app/admin/actions/recognition"
import type { Person } from "@/lib/types"
import type { BoundingBox } from "@/lib/avatar-utils"
import FaceCropPreview from "@/components/FaceCropPreview"

interface GlobalUnknownFacesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

interface ClusterFace {
  id: string
  photo_id: string
  image_url: string
  bbox: {
    x: number
    y: number
    width: number
    height: number
  }
  original_filename?: string
  gallery_id?: string
  gallery_title?: string
  shoot_date?: string
  distance_to_centroid?: number
}

interface Cluster {
  cluster_id: number
  size: number
  faces: ClusterFace[]
}

export function GlobalUnknownFacesDialog({ open, onOpenChange, onComplete }: GlobalUnknownFacesDialogProps) {
  const [loading, setLoading] = useState(false)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [currentClusterIndex, setCurrentClusterIndex] = useState(0)
  const [people, setPeople] = useState<Person[]>([])
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [showSelectPerson, setShowSelectPerson] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [removedFaces, setRemovedFaces] = useState<Set<string>>(new Set())
  const [autoAvatarEnabled, setAutoAvatarEnabled] = useState(true)

  useEffect(() => {
    if (open) {
      loadClusters()
      loadPeople()
      loadConfig()
      setRemovedFaces(new Set())
      setCurrentClusterIndex(0)
    }
  }, [open])

  useEffect(() => {
    setRemovedFaces(new Set())
  }, [currentClusterIndex])

  async function loadConfig() {
    try {
      const response = await fetch("/api/admin/training/config")
      if (response.ok) {
        const config = await response.json()
        setAutoAvatarEnabled(config.auto_avatar_on_create ?? true)
      }
    } catch (error) {
      console.error("[GlobalUnknownFaces] Error loading config:", error)
    }
  }

  async function loadClusters() {
    setLoading(true)
    try {
      console.log("[GlobalUnknownFaces] Loading all unknown face clusters...")

      const result = await clusterAllUnknownFacesAction()

      console.log("[GlobalUnknownFaces] Result:", result)

      if (result.success && result.data) {
        const loadedClusters = result.data.clusters || []
        setClusters(loadedClusters)
        setCurrentClusterIndex(0)
        console.log("[GlobalUnknownFaces] Loaded", loadedClusters.length, "clusters")
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

  const bestFaceForAvatar = useMemo(() => {
    if (!clusters.length || currentClusterIndex >= clusters.length) return null
    
    const currentCluster = clusters[currentClusterIndex]
    const visibleFaces = currentCluster.faces.filter((f) => !removedFaces.has(f.id))
    
    if (!visibleFaces.length) return null
    
    return visibleFaces[0]
  }, [clusters, currentClusterIndex, removedFaces])

  async function handleCreatePerson() {
    setShowAddPerson(true)
  }

  async function handlePersonCreated(personId: string, personName: string) {
    setShowAddPerson(false)
    await loadPeople()
    await assignClusterToPerson(personId)
  }

  async function handleSelectPerson(personId: string) {
    if (!personId) return
    setShowSelectPerson(false)
    await assignClusterToPerson(personId)
  }

  async function assignClusterToPerson(personId: string) {
    if (clusters.length === 0 || currentClusterIndex >= clusters.length) return

    const currentCluster = clusters[currentClusterIndex]
    const facesToAssign = currentCluster.faces.filter((f) => !removedFaces.has(f.id))
    const faceIds = facesToAssign.map((f) => f.id)

    setProcessing(true)
    try {
      const result = await assignFacesToPersonAction(faceIds, personId)
      if (result.success) {
        const uniquePhotoIds = [...new Set(facesToAssign.map((f) => f.photo_id))]
        console.log("[GlobalUnknownFaces] Marking", uniquePhotoIds.length, "photos as processed")

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
  }

  async function handleRejectCluster() {
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
      console.log("[GlobalUnknownFaces] Rejecting cluster with", faceIds.length, "faces")
      const result = await rejectFaceClusterAction(faceIds)
      
      if (result.success) {
        console.log("[GlobalUnknownFaces] Successfully rejected", result.deleted, "faces")
        moveToNextCluster()
      } else {
        console.error("[GlobalUnknownFaces] Error rejecting cluster:", result.error)
      }
    } catch (error) {
      console.error("[GlobalUnknownFaces] Error rejecting cluster:", error)
    } finally {
      setProcessing(false)
    }
  }

  function handlePreviousCluster() {
    if (currentClusterIndex > 0) {
      setRemovedFaces(new Set())
      setCurrentClusterIndex(currentClusterIndex - 1)
    }
  }

  function handleNextCluster() {
    if (currentClusterIndex + 1 < clusters.length) {
      setRemovedFaces(new Set())
      setCurrentClusterIndex(currentClusterIndex + 1)
    }
  }

  function moveToNextCluster() {
    setRemovedFaces(new Set())
    if (currentClusterIndex + 1 >= clusters.length) {
      onOpenChange(false)
      onComplete?.()
    } else {
      setCurrentClusterIndex(currentClusterIndex + 1)
    }
  }

  function handleRemoveFace(faceId: string) {
    setRemovedFaces((prev) => new Set(prev).add(faceId))
  }

  const currentCluster = clusters[currentClusterIndex]
  const hasPreviousCluster = currentClusterIndex > 0
  const hasNextCluster = currentClusterIndex + 1 < clusters.length
  const visibleFaces = currentCluster?.faces.filter((f) => !removedFaces.has(f.id)) || []

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Неизвестные лица - кластеризация</DialogTitle>
            <DialogDescription>
              {loading
                ? "Загрузка кластеров по всей базе..."
                : clusters.length === 0
                  ? "Нет неизвестных лиц для кластеризации"
                  : "Выберите действие для каждого кластера похожих лиц"}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : clusters.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Все лица распознаны!</p>
            </div>
          ) : currentCluster ? (
            <>
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="grid grid-cols-4 gap-4 content-start">
                  {visibleFaces.map((face, index) => (
                    <div key={face.id} className="relative">
                      <div className="aspect-square rounded-lg overflow-hidden border">
                        <FaceCropPreview
                          imageUrl={face.image_url || "/placeholder.svg"}
                          bbox={face.bbox}
                        />
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={() => handleRemoveFace(face.id)}
                        title="Убрать из кластера"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <div className="mt-1 text-xs text-muted-foreground truncate text-center">
                        {index === 0 && (
                          <span className="text-primary font-medium">★ </span>
                        )}
                        {face.original_filename || face.gallery_title || "—"}
                        {face.distance_to_centroid !== undefined && (
                          <span className="ml-1 opacity-60">({face.distance_to_centroid.toFixed(2)})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {visibleFaces.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    <p>Все лица в кластере удалены</p>
                    <Button variant="outline" className="mt-2" onClick={handleNextCluster} disabled={!hasNextCluster}>
                      Перейти к следующему кластеру
                    </Button>
                  </div>
                )}
              </div>

              {visibleFaces.length > 0 && (
                <div className="flex-shrink-0 flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Кластер {currentClusterIndex + 1} из {clusters.length} (всего {currentCluster?.size || 0} фото)
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      variant="destructive" 
                      onClick={handleRejectCluster} 
                      disabled={processing}
                      title="Удалить весь кластер"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Отклонить
                    </Button>

                    <Button variant="outline" onClick={handleCreatePerson} disabled={processing}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Создать игрока
                    </Button>

                    <Popover open={showSelectPerson} onOpenChange={setShowSelectPerson}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" disabled={processing}>
                          <Users className="h-4 w-4 mr-2" />
                          Выбрать игрока
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Поиск игрока..." />
                          <CommandList>
                            <CommandEmpty>Игрок не найден</CommandEmpty>
                            <CommandGroup className="max-h-[300px] overflow-y-auto">
                              {people.map((person) => (
                                <CommandItem
                                  key={person.id}
                                  onSelect={() => handleSelectPerson(person.id)}
                                >
                                  {person.real_name}
                                  {person.telegram_name && ` (${person.telegram_name})`}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handlePreviousCluster}
                      disabled={!hasPreviousCluster || processing}
                      title="Предыдущий кластер"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleNextCluster}
                      disabled={!hasNextCluster || processing}
                      title="Следующий кластер"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AddPersonDialog 
        open={showAddPerson} 
        onOpenChange={setShowAddPerson} 
        onPersonCreated={handlePersonCreated}
        faceImageUrl={bestFaceForAvatar?.image_url}
        faceBbox={bestFaceForAvatar?.bbox as BoundingBox | undefined}
        autoAvatarEnabled={autoAvatarEnabled}
      />
    </>
  )
}
