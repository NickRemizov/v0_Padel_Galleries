"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, UserPlus, Users, ChevronLeft, ChevronRight, Trash2 } from "lucide-react"
import { AddPersonDialog } from "./add-person-dialog"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { clusterUnknownFacesAction, assignFacesToPersonAction, markPhotoAsProcessedAction } from "@/app/admin/actions/faces"
import { getPeopleAction } from "@/app/admin/actions/entities"
import type { Person } from "@/lib/types"
import FaceCropPreview from "@/components/FaceCropPreview"

interface UnknownFacesReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  galleryId: string
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
}

interface Cluster {
  cluster_id: number
  size: number
  faces: ClusterFace[]
}

export function UnknownFacesReviewDialog({ open, onOpenChange, galleryId, onComplete }: UnknownFacesReviewDialogProps) {
  const [loading, setLoading] = useState(false)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [currentClusterIndex, setCurrentClusterIndex] = useState(0)
  const [people, setPeople] = useState<Person[]>([])
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [showSelectPerson, setShowSelectPerson] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [removedFaces, setRemovedFaces] = useState<Set<string>>(new Set())
  const [minGridHeight, setMinGridHeight] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      loadClusters()
      loadPeople()
      setRemovedFaces(new Set())
      setMinGridHeight(null)
    }
  }, [open, galleryId])

  useEffect(() => {
    setRemovedFaces(new Set())
  }, [currentClusterIndex])

  async function loadClusters() {
    setLoading(true)
    try {
      console.log("[UnknownFacesDialog] Loading clusters for gallery:", galleryId)

      const result = await clusterUnknownFacesAction(galleryId)

      console.log("[UnknownFacesDialog] Result:", result)

      if (result.success && result.data) {
        const loadedClusters = result.data.clusters || []
        setClusters(loadedClusters)
        setCurrentClusterIndex(0)
        console.log("[UnknownFacesDialog] Loaded", loadedClusters.length, "clusters")
        
        // Calculate minHeight based on largest cluster
        if (loadedClusters.length > 0) {
          const maxFaces = Math.max(...loadedClusters.map(c => c.faces.length))
          const rows = Math.ceil(maxFaces / 4) // 4 columns
          // Each row: ~200px (aspect-square) + 16px (gap)
          const calculatedHeight = rows * 216
          setMinGridHeight(calculatedHeight)
          console.log("[UnknownFacesDialog] Max faces:", maxFaces, "rows:", rows, "minHeight:", calculatedHeight)
        }
      }
    } catch (error) {
      console.error("[UnknownFacesReview] Error loading clusters:", error)
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
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Неизвестные лица - кластеризация</DialogTitle>
            <DialogDescription>
              {loading
                ? "Загрузка кластеров..."
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
                <div 
                  className="grid grid-cols-4 gap-4"
                  style={{ minHeight: minGridHeight ? `${minGridHeight}px` : undefined }}
                >
                  {visibleFaces.map((face) => (
                    <div key={face.id} className="relative aspect-square">
                      <FaceCropPreview imageUrl={face.image_url || "/placeholder.svg"} bbox={face.bbox} />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={() => handleRemoveFace(face.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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

      <AddPersonDialog open={showAddPerson} onOpenChange={setShowAddPerson} onPersonCreated={handlePersonCreated} />
    </>
  )
}
