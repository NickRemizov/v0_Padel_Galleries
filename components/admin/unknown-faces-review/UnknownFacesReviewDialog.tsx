"use client"

import { useState, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { AddPersonDialog } from "../add-person-dialog"

import type { UnknownFacesReviewDialogProps } from "./types"
import { useClusterReview } from "./hooks"
import { ClusterGrid, ClusterActions } from "./components"

export function UnknownFacesReviewDialog({
  open,
  onOpenChange,
  galleryId,
  onComplete,
}: UnknownFacesReviewDialogProps) {
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [showSelectPerson, setShowSelectPerson] = useState(false)

  const {
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
    loadPeople,
    assignClusterToPerson,
    rejectCluster,
    goToPreviousCluster,
    goToNextCluster,
    removeFace,
  } = useClusterReview({ galleryId, open, onOpenChange, onComplete })

  const handleCreatePerson = useCallback(() => {
    setShowAddPerson(true)
  }, [])

  const handlePersonCreated = useCallback(async (personId: string, personName: string) => {
    setShowAddPerson(false)
    await loadPeople()
    await assignClusterToPerson(personId)
  }, [loadPeople, assignClusterToPerson])

  const handleSelectPerson = useCallback(async (personId: string) => {
    if (!personId) return
    setShowSelectPerson(false)
    await assignClusterToPerson(personId)
  }, [assignClusterToPerson])

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
                <ClusterGrid
                  faces={visibleFaces}
                  minHeight={minGridHeight}
                  hasNextCluster={hasNextCluster}
                  onRemoveFace={removeFace}
                  onNextCluster={goToNextCluster}
                />
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
                  showSelectPerson={showSelectPerson}
                  onShowSelectPersonChange={setShowSelectPerson}
                  onCreatePerson={handleCreatePerson}
                  onSelectPerson={handleSelectPerson}
                  onRejectCluster={rejectCluster}
                  onPrevious={goToPreviousCluster}
                  onNext={goToNextCluster}
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
      />
    </>
  )
}
