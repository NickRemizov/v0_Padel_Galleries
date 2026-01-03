"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import {
  getGalleriesWithUnprocessedPhotosAction,
  getGalleryPhotosForRecognitionAction,
  getGalleriesWithUnverifiedFacesAction,
  getGalleryUnverifiedPhotosAction,
  getRecognitionConfigAction,
} from "@/app/admin/actions/recognition"
import { processPhotoAction, markPhotoAsProcessedAction, rebuildIndexAction } from "@/app/admin/actions/faces"
import type { GalleryInfo, ProcessingResult, ProcessingMode } from "./types"
import { GallerySelector } from "./GallerySelector"
import { ProcessingView } from "./ProcessingView"

interface BatchRecognitionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

export function BatchRecognitionDialog({ open, onOpenChange, onComplete }: BatchRecognitionDialogProps) {
  const [loading, setLoading] = useState(false)
  const [galleries, setGalleries] = useState<GalleryInfo[]>([])
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<ProcessingResult[]>([])
  const [applyQualityFilters, setApplyQualityFilters] = useState(true)
  const [stage, setStage] = useState<"select" | "processing" | "done">("select")
  const [mode, setMode] = useState<ProcessingMode>("unprocessed")

  useEffect(() => {
    if (open) {
      loadGalleries()
      setStage("select")
      setResults([])
    }
  }, [open, mode])

  async function loadGalleries() {
    setLoading(true)
    try {
      if (mode === "unprocessed") {
        const result = await getGalleriesWithUnprocessedPhotosAction()
        if (result.success) {
          setGalleries(
            result.galleries.map((g) => ({
              id: g.id,
              title: g.title,
              shoot_date: g.shoot_date,
              total_photos: g.total_photos,
              photos_to_process: g.unprocessed_photos,
              selected: false,
            }))
          )
        }
      } else {
        const result = await getGalleriesWithUnverifiedFacesAction()
        if (result.success) {
          setGalleries(
            result.galleries.map((g) => ({
              id: g.id,
              title: g.title,
              shoot_date: g.shoot_date,
              total_photos: g.total_photos,
              photos_to_process: g.unverified_photos,
              selected: false,
            }))
          )
        }
      }
    } catch (error) {
      console.error("[BatchRecognition] Error loading galleries:", error)
    } finally {
      setLoading(false)
    }
  }

  function toggleGallery(id: string) {
    setGalleries((prev) =>
      prev.map((g) => (g.id === id ? { ...g, selected: !g.selected } : g))
    )
  }

  function selectAll() {
    setGalleries((prev) => prev.map((g) => ({ ...g, selected: true })))
  }

  function deselectAll() {
    setGalleries((prev) => prev.map((g) => ({ ...g, selected: false })))
  }

  function formatDate(dateStr: string | null): string {
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

  function formatGalleryTitle(title: string, shootDate: string | null): string {
    const dateStr = formatDate(shootDate)
    return dateStr ? `${title} ${dateStr}` : title
  }

  async function startProcessing() {
    const selectedGalleries = galleries.filter((g) => g.selected)
    if (selectedGalleries.length === 0) return

    setStage("processing")
    setProcessing(true)

    const configResult = await getRecognitionConfigAction()
    const qualityParams = applyQualityFilters
      ? {
          confidenceThreshold: configResult.config?.confidence_thresholds?.high_data || 0.6,
          minDetectionScore: configResult.config?.quality_filters?.min_detection_score || 0.7,
          minFaceSize: configResult.config?.quality_filters?.min_face_size || 80,
          minBlurScore: configResult.config?.quality_filters?.min_blur_score || 80,
        }
      : undefined

    const allImages: { galleryId: string; galleryTitle: string; shootDate: string | null; image: any }[] = []

    for (const gallery of selectedGalleries) {
      let photosResult
      if (mode === "unprocessed") {
        photosResult = await getGalleryPhotosForRecognitionAction(gallery.id)
      } else {
        photosResult = await getGalleryUnverifiedPhotosAction(gallery.id)
      }
      
      if (photosResult.success) {
        const titleWithDate = formatGalleryTitle(gallery.title, gallery.shoot_date)
        for (const image of photosResult.images) {
          allImages.push({
            galleryId: gallery.id,
            galleryTitle: titleWithDate,
            shootDate: gallery.shoot_date,
            image,
          })
        }
      }
    }

    const initialResults: ProcessingResult[] = allImages.map((item) => ({
      galleryId: item.galleryId,
      galleryTitle: item.galleryTitle,
      imageId: item.image.id,
      filename: item.image.original_filename,
      facesFound: 0,
      facesRecognized: 0,
      status: "pending",
    }))
    setResults(initialResults)

    // v5.1: Rebuild index before batch processing for consistency
    if (allImages.length >= 25) {
      console.log(`[BatchRecognition] Rebuilding index before processing ${allImages.length} photos...`)
      try {
        await rebuildIndexAction()
        console.log("[BatchRecognition] Index rebuilt successfully")
      } catch (error) {
        console.warn("[BatchRecognition] Index rebuild failed, continuing anyway:", error)
      }
    }

    for (let i = 0; i < allImages.length; i++) {
      const item = allImages[i]

      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "processing" as const } : r))
      )

      try {
        const forceRedetect = mode === "unverified"
        const result = await processPhotoAction(
          item.image.id,
          forceRedetect,
          applyQualityFilters,
          qualityParams
        )

        if (result.success) {
          const facesFound = result.faces?.length || 0
          const facesRecognized = result.faces?.filter((f: any) => f.person_id).length || 0
          await markPhotoAsProcessedAction(item.image.id)

          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, facesFound, facesRecognized, status: "success" as const } : r
            )
          )
        } else {
          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, status: "error" as const, error: result.error || "Unknown error" } : r
            )
          )
        }
      } catch (error) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: "error" as const, error: error instanceof Error ? error.message : "Unknown error" }
              : r
          )
        )
      }
    }

    setProcessing(false)
    setStage("done")
    onComplete?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Пакетное распознавание галерей</DialogTitle>
          <DialogDescription>
            {stage === "select" && "Выберите режим и галереи для распознавания"}
            {stage === "processing" && `Обработка ${results.length} фото...`}
            {stage === "done" && "Обработка завершена"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : stage === "select" ? (
          <GallerySelector
            galleries={galleries}
            mode={mode}
            applyQualityFilters={applyQualityFilters}
            onModeChange={setMode}
            onToggleGallery={toggleGallery}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onApplyQualityFiltersChange={setApplyQualityFilters}
            onStartProcessing={startProcessing}
          />
        ) : (
          <ProcessingView
            results={results}
            processing={processing}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
