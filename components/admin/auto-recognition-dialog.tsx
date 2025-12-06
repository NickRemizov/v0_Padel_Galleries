"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { getBatchPhotoFacesAction, markPhotoAsProcessedAction } from "@/app/admin/actions"
import { processPhotoAction } from "@/app/admin/actions/faces"
import { getRecognitionConfigAction } from "@/app/admin/actions/recognition"
import type { GalleryImage } from "@/lib/types"

const VERSION = "v4.2-UnifiedConfig" // Updated for unified config

interface AutoRecognitionDialogProps {
  images: GalleryImage[]
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "all" | "remaining"
}

interface ProcessingResult {
  imageId: string
  filename: string
  facesFound: number
  facesRecognized: number
  status: "pending" | "processing" | "success" | "error"
  error?: string
}

export function AutoRecognitionDialog({ images, open, onOpenChange, mode }: AutoRecognitionDialogProps) {
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<ProcessingResult[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [applyQualityFilters, setApplyQualityFilters] = useState(true)

  async function processImageFaces(photoId: string, imageUrl: string, qualityParams: any) {
    console.log(`[${VERSION}] Processing image: ${photoId}`)
    console.log(`[${VERSION}] Apply quality filters:`, applyQualityFilters)
    console.log(`[${VERSION}] Quality params:`, qualityParams)

    const result = await processPhotoAction(
      photoId,
      false,
      applyQualityFilters,
      applyQualityFilters ? qualityParams : undefined,
    )

    if (!result.success) {
      throw new Error(result.error || "Failed to process photo")
    }

    const facesFound = result.faces?.length || 0
    const facesRecognized = result.faces?.filter((f: any) => f.person_id).length || 0

    console.log(`[${VERSION}] Detected ${facesFound} faces, recognized ${facesRecognized}`)

    return {
      facesFound,
      facesRecognized,
    }
  }

  async function startProcessing() {
    console.log(`[${VERSION}] AUTO-RECOGNITION: startProcessing called`)
    console.log(`[${VERSION}] AUTO-RECOGNITION: mode =`, mode)
    console.log(`[${VERSION}] AUTO-RECOGNITION: images.length =`, images.length)

    const configResult = await getRecognitionConfigAction()
    const qualityParams = {
      confidenceThreshold: configResult.config?.confidence_thresholds?.high_data || 0.6,
      minDetectionScore: configResult.config?.quality_filters?.min_detection_score || 0.7,
      minFaceSize: configResult.config?.quality_filters?.min_face_size || 80,
      minBlurScore: configResult.config?.quality_filters?.min_blur_score || 100,
    }
    console.log(`[${VERSION}] AUTO-RECOGNITION: Using quality params from config:`, qualityParams)

    setProcessing(true)
    setCurrentIndex(-1)

    let imagesToProcess = images

    if (mode === "remaining") {
      console.log(`[${VERSION}] AUTO-RECOGNITION: Mode is 'remaining', calling getBatchPhotoFacesAction...`)
      const batchResult = await getBatchPhotoFacesAction(images.map((img) => img.id))
      console.log(`[${VERSION}] AUTO-RECOGNITION: getBatchPhotoFacesAction result:`, batchResult)

      console.log(`[${VERSION}] AUTO-RECOGNITION: batchResult.success =`, batchResult.success)
      console.log(`[${VERSION}] AUTO-RECOGNITION: batchResult.data type =`, typeof batchResult.data)
      console.log(`[${VERSION}] AUTO-RECOGNITION: batchResult.data Array.isArray =`, Array.isArray(batchResult.data))

      if (batchResult.success && batchResult.data) {
        console.log(`[${VERSION}] AUTO-RECOGNITION: batchResult.data.length =`, batchResult.data.length)
        console.log(`[${VERSION}] AUTO-RECOGNITION: First 3 faces:`, batchResult.data.slice(0, 3))

        const facesMap = new Map<string, any[]>()
        for (const face of batchResult.data) {
          if (!facesMap.has(face.photo_id)) {
            facesMap.set(face.photo_id, [])
          }
          facesMap.get(face.photo_id)!.push(face)
        }

        console.log(`[${VERSION}] AUTO-RECOGNITION: facesMap size =`, facesMap.size)
        console.log(`[${VERSION}] AUTO-RECOGNITION: facesMap keys:`, Array.from(facesMap.keys()))

        imagesToProcess = images.filter((image) => {
          const faces = facesMap.get(image.id) || []

          console.log(`[${VERSION}] AUTO-RECOGNITION: Checking photo ${image.id} (${image.original_filename})`)
          console.log(`[${VERSION}] AUTO-RECOGNITION:   - faces.length = ${faces.length}`)

          // Если нет лиц в БД - это новое фото, нужно обработать
          if (faces.length === 0) {
            console.log(`[${VERSION}] AUTO-RECOGNITION:   - Decision: PROCESS (no faces in DB)`)
            return true
          }

          faces.forEach((face, idx) => {
            console.log(
              `[${VERSION}] AUTO-RECOGNITION:   - Face ${idx}: person_id=${face.person_id}, verified=${face.verified}`,
            )
          })

          // Если есть лица - обрабатываем только если есть неверифицированные
          const hasUnverifiedFaces = faces.some((face) => !face.verified)
          if (hasUnverifiedFaces) {
            console.log(`[${VERSION}] AUTO-RECOGNITION:   - Decision: PROCESS (has unverified faces)`)
          } else {
            console.log(`[${VERSION}] AUTO-RECOGNITION:   - Decision: SKIP (all faces verified)`)
          }
          return hasUnverifiedFaces
        })

        console.log(`[${VERSION}] AUTO-RECOGNITION: After filter, imagesToProcess.length =`, imagesToProcess.length)
      } else {
        console.log(`[${VERSION}] AUTO-RECOGNITION: batchResult NOT success or no data, using all images`)
      }
    }

    console.log(`[${VERSION}] AUTO-RECOGNITION: Final imagesToProcess.length =`, imagesToProcess.length)

    if (imagesToProcess.length === 0) {
      console.log(`[${VERSION}] AUTO-RECOGNITION: No images to process, finishing...`)
      setProcessing(false)
      return
    }

    const initialResults: ProcessingResult[] = imagesToProcess.map((img) => ({
      imageId: img.id,
      filename: img.original_filename,
      facesFound: 0,
      facesRecognized: 0,
      status: "pending",
    }))
    setResults(initialResults)
    console.log(`[${VERSION}] AUTO-RECOGNITION: Set initialResults, length =`, initialResults.length)

    const batchSize = 2

    for (let i = 0; i < imagesToProcess.length; i++) {
      const image = imagesToProcess[i]
      setCurrentIndex(i)

      setResults((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "processing" as const } : r)))

      try {
        const existingFacesResult = await getBatchPhotoFacesAction([image.id])
        const existingFaces = existingFacesResult.success ? existingFacesResult.data || [] : []

        console.log(`[${VERSION}] Image ${image.original_filename}: Found ${existingFaces.length} existing faces`)

        const result = await processImageFaces(image.id, image.image_url, qualityParams)

        console.log(`[${VERSION}] Processed ${result.facesFound} faces, recognized ${result.facesRecognized}`)

        await markPhotoAsProcessedAction(image.id)
        console.log(`[${VERSION}] Marked photo ${image.id} as processed`)

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  facesFound: result.facesFound,
                  facesRecognized: result.facesRecognized,
                  status: "success" as const,
                }
              : r,
          ),
        )
      } catch (error) {
        console.error(`[${VERSION}] Error processing image:`, error)
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "error" as const,
                  error: error instanceof Error ? error.message : "Unknown error",
                }
              : r,
          ),
        )
      }
    }

    setProcessing(false)
  }

  const totalImages = results.length > 0 ? results.length : images.length
  const processedImages = processing ? currentIndex + 1 : results.filter((r) => r.status !== "pending").length
  const progress = totalImages > 0 ? (processedImages / totalImages) * 100 : 0

  const totalFaces = results.reduce((sum, r) => sum + r.facesFound, 0)
  const totalRecognized = results.reduce((sum, r) => sum + r.facesRecognized, 0)

  const imagesToProcess = mode === "remaining" ? results.length : images.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "all" ? "Автоматическое распознавание лиц" : "Распознавание оставшихся фото"}
          </DialogTitle>
          <DialogDescription>
            {mode === "all"
              ? `Обработка ${imagesToProcess} фотографий. Это может занять несколько минут.`
              : `Обработка ${imagesToProcess} фотографий без ручной верификации. Это может занять несколько минут.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!processing && results.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {mode === "all"
                  ? "Система автоматически обнаружит и распознает лица на всех фотографиях галереи используя InsightFace."
                  : "Система обработает только фотографии без ручной верификации используя InsightFace."}
              </p>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="apply-quality-filters-auto"
                  checked={applyQualityFilters}
                  onCheckedChange={(checked) => setApplyQualityFilters(checked as boolean)}
                />
                <label
                  htmlFor="apply-quality-filters-auto"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Применять настройки качества из глобального конфига
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Если выключено, будут распознаны все лица без фильтрации по качеству
              </p>

              <Button onClick={startProcessing} className="w-full">
                Начать обработку
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Прогресс</span>
                  <span>
                    {processedImages} / {totalImages}
                  </span>
                </div>
                <Progress value={progress} />
              </div>

              {processing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Обработка фотографий...</span>
                </div>
              )}

              {!processing && (
                <div className="space-y-2 rounded-lg border p-4">
                  <h3 className="font-semibold">Результаты</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Обработано фото:</span>
                      <span className="ml-2 font-medium">{results.filter((r) => r.status === "success").length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Ошибок:</span>
                      <span className="ml-2 font-medium">{results.filter((r) => r.status === "error").length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Найдено лиц:</span>
                      <span className="ml-2 font-medium">{totalFaces}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Распознано:</span>
                      <span className="ml-2 font-medium">{totalRecognized}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {results.map((result, index) => (
                  <div key={result.imageId} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div className="flex-1 truncate">
                      <p className="truncate font-medium" title={result.filename}>
                        {result.filename}
                      </p>
                      {result.status === "success" && (
                        <p className="text-xs text-muted-foreground">
                          Лиц: {result.facesFound}, распознано: {result.facesRecognized}
                        </p>
                      )}
                      {result.status === "error" && <p className="text-xs text-destructive">{result.error}</p>}
                    </div>
                    <div>
                      {result.status === "pending" && <Badge variant="secondary">Ожидание</Badge>}
                      {result.status === "processing" && (
                        <Badge variant="secondary">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Обработка
                        </Badge>
                      )}
                      {result.status === "success" && (
                        <Badge variant="default">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Готово
                        </Badge>
                      )}
                      {result.status === "error" && (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          Ошибка
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!processing && (
                <Button onClick={() => onOpenChange(false)} className="w-full">
                  Закрыть
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
