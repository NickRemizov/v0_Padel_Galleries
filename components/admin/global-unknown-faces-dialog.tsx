"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, UserPlus, Users, X, Trash2, ChevronRight } from "lucide-react"
import { AddPersonDialog } from "./add-person-dialog"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { assignFacesToPersonAction, markPhotoAsProcessedAction, clusterUnknownFacesAction } from "@/app/admin/actions/faces"
import { getPeopleAction } from "@/app/admin/actions/entities"
import { getGalleriesWithUnknownFacesAction } from "@/app/admin/actions/recognition"
import type { Person } from "@/lib/types"
import FaceCropPreview from "@/components/FaceCropPreview"
import { Badge } from "@/components/ui/badge"

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
}

interface Cluster {
  cluster_id: number
  size: number
  faces: ClusterFace[]
  gallery_id: string
  gallery_title: string
  shoot_date: string | null
}

interface GalleryInfo {
  id: string
  title: string
  shoot_date: string | null
  unknown_faces_count: number
}

export function GlobalUnknownFacesDialog({ open, onOpenChange, onComplete }: GlobalUnknownFacesDialogProps) {
  const [loading, setLoading] = useState(false)
  const [loadingClusters, setLoadingClusters] = useState(false)
  const [galleries, setGalleries] = useState<GalleryInfo[]>([])
  const [currentGalleryIndex, setCurrentGalleryIndex] = useState(0)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [currentClusterIndex, setCurrentClusterIndex] = useState(0)
  const [people, setPeople] = useState<Person[]>([])
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [showSelectPerson, setShowSelectPerson] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<string>("")
  const [processing, setProcessing] = useState(false)
  const [removedFaces, setRemovedFaces] = useState<Set<string>>(new Set())
  const [stage, setStage] = useState<"loading" | "no-data" | "clustering">("loading")

  useEffect(() => {
    if (open) {
      loadGalleries()
      loadPeople()
      setRemovedFaces(new Set())
      setCurrentGalleryIndex(0)
      setCurrentClusterIndex(0)
      setClusters([])
    }
  }, [open])

  useEffect(() => {
    setRemovedFaces(new Set())
  }, [currentClusterIndex])

  async function loadGalleries() {
    setLoading(true)
    setStage("loading")
    try {
      console.log("[GlobalUnknownFaces] Loading galleries with unknown faces...")

      const result = await getGalleriesWithUnknownFacesAction()

      console.log("[GlobalUnknownFaces] Galleries result:", result)

      if (result.success && result.galleries.length > 0) {
        setGalleries(result.galleries)
        setCurrentGalleryIndex(0)
        // Загружаем кластеры для первой галереи
        await loadClustersForGallery(result.galleries[0])
      } else {
        setStage("no-data")
      }
    } catch (error) {
      console.error("[GlobalUnknownFaces] Error loading galleries:", error)
      setStage("no-data")
    } finally {
      setLoading(false)
    }
  }

  async function loadClustersForGallery(gallery: GalleryInfo) {
    setLoadingClusters(true)
    try {
      console.log("[GlobalUnknownFaces] Loading clusters for gallery:", gallery.id, gallery.title)

      const result = await clusterUnknownFacesAction(gallery.id)

      console.log("[GlobalUnknownFaces] Clusters result:", result)

      if (result.success && result.data && result.data.clusters.length > 0) {
        // Добавляем информацию о галерее к каждому кластеру
        const clustersWithGallery = result.data.clusters.map((cluster: any) => ({
          ...cluster,
          gallery_id: gallery.id,
          gallery_title: gallery.title,
          shoot_date: gallery.shoot_date,
        }))
        setClusters(clustersWithGallery)
        setCurrentClusterIndex(0)
        setStage("clustering")
      } else {
        // Нет кластеров в этой галерее, переходим к следующей
        await moveToNextGallery()
      }
    } catch (error) {
      console.error("[GlobalUnknownFaces] Error loading clusters:", error)
      await moveToNextGallery()
    } finally {
      setLoadingClusters(false)
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
        console.log("[GlobalUnknownFaces] Marking", uniquePhotoIds.length, "photos as processed")

        for (const photoId of uniquePhotoIds) {
          await markPhotoAsProcessedAction(photoId)
        }

        await moveToNextCluster()
      }
    } catch (error) {
      console.error("[GlobalUnknownFaces] Error assigning faces:", error)
    } finally {
      setProcessing(false)
    }
  }

  async function handleRejectCluster() {
    await moveToNextCluster()
  }

  async function moveToNextCluster() {
    setRemovedFaces(new Set())
    if (currentClusterIndex + 1 >= clusters.length) {
      // Все кластеры в текущей галерее обработаны, переходим к следующей
      await moveToNextGallery()
    } else {
      setCurrentClusterIndex(currentClusterIndex + 1)
    }
  }

  async function moveToNextGallery() {
    const nextIndex = currentGalleryIndex + 1
    if (nextIndex >= galleries.length) {
      // Все галереи обработаны
      onOpenChange(false)
      onComplete?.()
    } else {
      setCurrentGalleryIndex(nextIndex)
      setClusters([])
      setCurrentClusterIndex(0)
      await loadClustersForGallery(galleries[nextIndex])
    }
  }

  function handleRemoveFace(faceId: string) {
    setRemovedFaces((prev) => new Set(prev).add(faceId))
  }

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return ""
    try {
      const date = new Date(dateStr)
      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      return `${day}.${month}`
    } catch {
      return ""
    }
  }

  const currentCluster = clusters[currentClusterIndex]
  const currentGallery = galleries[currentGalleryIndex]
  const hasMoreClusters = currentClusterIndex + 1 < clusters.length
  const hasMoreGalleries = currentGalleryIndex + 1 < galleries.length
  const visibleFaces = currentCluster?.faces.filter((f) => !removedFaces.has(f.id)) || []

  const totalUnknownFaces = galleries.reduce((sum, g) => sum + g.unknown_faces_count, 0)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Неизвестные лица — глобальная кластеризация</DialogTitle>
            <DialogDescription>
              {loading || loadingClusters
                ? "Загрузка кластеров..."
                : stage === "no-data"
                  ? "Нет неизвестных лиц для кластеризации"
                  : `Галерея ${currentGalleryIndex + 1}/${galleries.length}: ${currentGallery?.title || ""} • Кластер ${currentClusterIndex + 1}/${clusters.length}`}
            </DialogDescription>
          </DialogHeader>

          {(loading || loadingClusters) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : stage === "no-data" ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Все лица распознаны!</p>
            </div>
          ) : currentCluster ? (
            <div className="space-y-4">
              {/* Информация о галерее */}
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">
                  {currentGallery?.title}
                  {currentGallery?.shoot_date && ` ${formatDate(currentGallery.shoot_date)}`}
                </Badge>
                <span className="text-muted-foreground">
                  {currentCluster.size} похожих лиц
                </span>
              </div>

              <div className="grid grid-cols-4 gap-4">
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
                  <Button variant="outline" className="mt-2" onClick={handleRejectCluster}>
                    Перейти к следующему кластеру
                  </Button>
                </div>
              )}

              {visibleFaces.length > 0 && (
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
                    Пропустить
                  </Button>
                </div>
              )}

              <div className="text-sm text-muted-foreground text-center space-y-1">
                {hasMoreClusters && (
                  <p>Еще {clusters.length - currentClusterIndex - 1} кластер(ов) в этой галерее</p>
                )}
                {hasMoreGalleries && (
                  <p className="flex items-center justify-center gap-1">
                    <ChevronRight className="h-4 w-4" />
                    Еще {galleries.length - currentGalleryIndex - 1} галерей с неизвестными лицами
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AddPersonDialog open={showAddPerson} onOpenChange={setShowAddPerson} onPersonCreated={handlePersonCreated} />
    </>
  )
}
