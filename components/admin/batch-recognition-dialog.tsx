"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, CheckCircle2, XCircle, Play, Images } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getGalleriesWithUnprocessedPhotosAction,
  getGalleryPhotosForRecognitionAction,
  getGalleriesWithUnverifiedFacesAction,
  getGalleryUnverifiedPhotosAction,
  getRecognitionConfigAction,
} from "@/app/admin/actions/recognition"
import { processPhotoAction, markPhotoAsProcessedAction } from "@/app/admin/actions/faces"

interface BatchRecognitionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

interface GalleryInfo {
  id: string
  title: string
  shoot_date: string | null
  total_photos: number
  photos_to_process: number
  selected: boolean
}

interface ProcessingResult {
  galleryId: string
  galleryTitle: string
  imageId: string
  filename: string
  facesFound: number
  facesRecognized: number
  status: "pending" | "processing" | "success" | "error"
  error?: string
}

type ProcessingMode = "unprocessed" | "unverified"

export function BatchRecognitionDialog({ open, onOpenChange, onComplete }: BatchRecognitionDialogProps) {
  const [loading, setLoading] = useState(false)
  const [galleries, setGalleries] = useState<GalleryInfo[]>([])
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<ProcessingResult[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
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

    // Загружаем конфиг
    const configResult = await getRecognitionConfigAction()
    console.log("[BatchRecognition] Config loaded:", configResult.config)
    
    const qualityParams = applyQualityFilters
      ? {
          confidenceThreshold: configResult.config?.confidence_thresholds?.high_data || 0.6,
          minDetectionScore: configResult.config?.quality_filters?.min_detection_score || 0.7,
          minFaceSize: configResult.config?.quality_filters?.min_face_size || 80,
          minBlurScore: configResult.config?.quality_filters?.min_blur_score || 80,
        }
      : undefined
    
    console.log("[BatchRecognition] Quality params:", qualityParams)

    // Собираем все фото из выбранных галерей
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

    // Инициализируем результаты
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

    // Обрабатываем по одному
    for (let i = 0; i < allImages.length; i++) {
      const item = allImages[i]
      setCurrentIndex(i)

      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "processing" as const } : r))
      )

      try {
        // Для режима "unverified" всегда делаем re-detect (forceRedetect = true)
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
              idx === i
                ? {
                    ...r,
                    facesFound,
                    facesRecognized,
                    status: "success" as const,
                  }
                : r
            )
          )
        } else {
          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i
                ? {
                    ...r,
                    status: "error" as const,
                    error: result.error || "Unknown error",
                  }
                : r
            )
          )
        }
      } catch (error) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "error" as const,
                  error: error instanceof Error ? error.message : "Unknown error",
                }
              : r
          )
        )
      }
    }

    setProcessing(false)
    setStage("done")
    onComplete?.()
  }

  const selectedCount = galleries.filter((g) => g.selected).length
  const totalToProcess = galleries
    .filter((g) => g.selected)
    .reduce((sum, g) => sum + g.photos_to_process, 0)

  const processedImages = results.filter((r) => r.status !== "pending" && r.status !== "processing").length
  const progress = results.length > 0 ? (processedImages / results.length) * 100 : 0
  const totalFaces = results.reduce((sum, r) => sum + r.facesFound, 0)
  const totalRecognized = results.reduce((sum, r) => sum + r.facesRecognized, 0)
  const errorCount = results.filter((r) => r.status === "error").length

  const modeLabels = {
    unprocessed: {
      title: "Необработанные фото",
      description: "Фото, которые ещё не проходили детекцию лиц (has_been_processed = false)",
      empty: "Нет галерей с необработанными фото",
      badge: "к обработке",
    },
    unverified: {
      title: "Неверифицированные лица",
      description: "Фото с лицами, где confidence < 1 (не подтверждены вручную)",
      empty: "Нет галерей с неверифицированными лицами",
      badge: "к верификации",
    },
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
          <div className="space-y-4">
            {/* Mode selector */}
            <Tabs value={mode} onValueChange={(v) => setMode(v as ProcessingMode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="unprocessed">Необработанные</TabsTrigger>
                <TabsTrigger value="unverified">Неверифицированные</TabsTrigger>
              </TabsList>
            </Tabs>

            <p className="text-sm text-muted-foreground">
              {modeLabels[mode].description}
            </p>

            {galleries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Images className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>{modeLabels[mode].empty}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="apply-quality-filters"
                      checked={applyQualityFilters}
                      onCheckedChange={(checked) => setApplyQualityFilters(checked as boolean)}
                    />
                    <label htmlFor="apply-quality-filters" className="text-sm">
                      Применять настройки качества
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selectAll}>
                      Выбрать все
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAll}>
                      Снять все
                    </Button>
                  </div>
                </div>

                <ScrollArea className="h-[350px] border rounded-md p-2">
                  <div className="space-y-1">
                    {galleries.map((gallery) => (
                      <div
                        key={gallery.id}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                          gallery.selected ? "bg-accent" : ""
                        }`}
                        onClick={() => toggleGallery(gallery.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox checked={gallery.selected} />
                          <div>
                            <div className="font-medium">
                              {gallery.title}
                              {gallery.shoot_date && (
                                <span className="text-muted-foreground ml-2">
                                  {formatDate(gallery.shoot_date)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Всего: {gallery.total_photos} фото
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary">
                          {gallery.photos_to_process} {modeLabels[mode].badge}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-sm text-muted-foreground">
                    Выбрано: {selectedCount} галерей, {totalToProcess} фото
                  </div>
                  <Button onClick={startProcessing} disabled={selectedCount === 0}>
                    <Play className="mr-2 h-4 w-4" />
                    Начать обработку
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Прогресс</span>
                <span>
                  {processedImages} / {results.length}
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
                    <span className="text-muted-foreground">Обработано:</span>
                    <span className="ml-2 font-medium">
                      {results.filter((r) => r.status === "success").length}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ошибок:</span>
                    <span className="ml-2 font-medium">{errorCount}</span>
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

            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {results.map((result, index) => (
                  <div
                    key={`${result.galleryId}-${result.imageId}`}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  >
                    <div className="flex-1 truncate">
                      <p className="truncate font-medium" title={result.filename}>
                        {result.filename}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {result.galleryTitle}
                      </p>
                      {result.status === "success" && (
                        <p className="text-xs text-muted-foreground">
                          Лиц: {result.facesFound}, распознано: {result.facesRecognized}
                        </p>
                      )}
                      {result.status === "error" && (
                        <p className="text-xs text-destructive">{result.error}</p>
                      )}
                    </div>
                    <div>
                      {result.status === "pending" && (
                        <Badge variant="secondary">Ожидание</Badge>
                      )}
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
            </ScrollArea>

            {!processing && (
              <Button onClick={() => onOpenChange(false)} className="w-full">
                Закрыть
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
