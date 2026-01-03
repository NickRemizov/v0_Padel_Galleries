"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { AddPersonDialog } from "../add-person-dialog"
import type { BoundingBox } from "@/lib/avatar-utils"
import type { GlobalUnknownFacesDialogProps } from "./types"
import { useClusterNavigation } from "./useClusterNavigation"
import { ClusterGrid } from "./ClusterGrid"
import { ClusterActions } from "./ClusterActions"

export function GlobalUnknownFacesDialog({ open, onOpenChange, onComplete }: GlobalUnknownFacesDialogProps) {
  const [showAddPerson, setShowAddPerson] = useState(false)

  const {
    loading,
    clusters,
    currentClusterIndex,
    currentCluster,
    visibleFaces,
    people,
    processing,
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
  } = useClusterNavigation(open, onComplete, () => onOpenChange(false))

  async function handlePersonCreated(personId: string) {
    setShowAddPerson(false)
    await loadPeople()
    await assignClusterToPerson(personId)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden">
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
                <ClusterGrid
                  faces={visibleFaces}
                  minGridHeight={minGridHeight}
                  onRemoveFace={handleRemoveFace}
                />

                {visibleFaces.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    <p>Все лица в кластере удалены</p>
                    <Button
                      variant="outline"
                      className="mt-2"
                      onClick={handleNextCluster}
                      disabled={!hasNextCluster}
                    >
                      Перейти к следующему кластеру
                    </Button>
                  </div>
                )}
              </div>

              {visibleFaces.length > 0 && (
                <ClusterActions
                  currentIndex={currentClusterIndex}
                  totalClusters={clusters.length}
                  clusterSize={currentCluster.size}
                  people={people}
                  processing={processing}
                  hasPrevious={hasPreviousCluster}
                  hasNext={hasNextCluster}
                  onCreatePerson={() => setShowAddPerson(true)}
                  onSelectPerson={assignClusterToPerson}
                  onRejectCluster={handleRejectCluster}
                  onPrevious={handlePreviousCluster}
                  onNext={handleNextCluster}
                />
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
      />
    </>
  )
}
