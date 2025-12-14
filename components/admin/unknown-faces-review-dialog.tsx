"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, UserPlus, Users, X, Trash2 } from "lucide-react"
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
  const [selectedPersonId, setSelectedPersonId] = useState<string>("")
  const [processing, setProcessing] = useState(false)
  const [removedFaces, setRemovedFaces] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) {
      loadClusters()
      loadPeople()
      setRemovedFaces(new Set())
    }
  }, [open, galleryId])

  useEffect(() => {
    setRemovedFaces(new Set())
  }, [currentClusterIndex])

  async function loadClusters() {
    setLoading(true)
    try {
      console.log("[v0] [UnknownFacesDialog] Loading clusters for gallery:", galleryId)

      const result = await clusterUnknownFacesAction(galleryId)

      console.log("[v0] [UnknownFacesDialog] Action result:", result)
      console.log("[v0] [UnknownFacesDialog] Result success:", result.success)
      console.log("[v0] [UnknownFacesDialog] Result data:", result.data)
      console.log("[v0] [UnknownFacesDialog] Clusters array:", result.data?.clusters)
      console.log("[v0] [UnknownFacesDialog] Clusters length:", result.data?.clusters?.length)

      if (result.success && result.data) {
        setClusters(result.data.clusters || [])
        setCurrentClusterIndex(0)
        console.log("[v0] [UnknownFacesDialog] Set clusters state:", result.data.clusters?.length || 0, "clusters")
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
    await assignClusterToPerson(personId)
  }

  async function handleSelectExistingPerson() {
    if (!selectedPersonId) return
    await assignClusterToPerson(selectedPersonId)
    setShowSelectPerson(false)
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
        // Mark all unique photos as processed
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

  async function handleRejectCluster() {
    moveToNextCluster()
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
  const hasMoreClusters = currentClusterIndex + 1 < clusters.length

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Неизвестные лица - кластеризация</DialogTitle>
            <DialogDescription>
              {loading
                ? "Загрузка кластеров..."
                : clusters.length === 0
                  ? "Нет неизвестных лиц для кластеризации"
                  : `Кластер ${currentClusterIndex + 1} из ${clusters.length} (${currentCluster?.size || 0} фото)`}
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
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {currentCluster.faces
                  .filter((face) => !removedFaces.has(face.id))
                  .map((face, index) => (
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

              <div className="flex gap-2 justify-end">
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
                              onSelect={() => {
                                setSelectedPersonId(person.id)
                                handleSelectExistingPerson()
                              }}
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

                <Button variant="destructive" onClick={handleRejectCluster} disabled={processing}>
                  <X className="h-4 w-4 mr-2" />
                  Отклонить кластер
                </Button>
              </div>

              {hasMoreClusters && (
                <p className="text-sm text-muted-foreground text-center">
                  Еще {clusters.length - currentClusterIndex - 1} кластер(ов) после этого
                </p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AddPersonDialog open={showAddPerson} onOpenChange={setShowAddPerson} onPersonCreated={handlePersonCreated} />
    </>
  )
}
