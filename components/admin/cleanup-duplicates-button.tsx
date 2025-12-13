"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cleanupDuplicateFacesAction } from "@/app/admin/actions"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, CheckCircle2, XCircle, Trash2, Eye, AlertTriangle } from "lucide-react"

interface PreviewResult {
  success: boolean
  error?: string
  data?: {
    preview: true
    totalRecords: number
    duplicateGroups: number
    recordsToDelete: number
    previewGroups: Array<{
      key: string
      totalRecords: number
      keeper: { id: string; verified: boolean; confidence: number; created_at: string }
      toDelete: Array<{ id: string; verified: boolean; confidence: number; created_at: string }>
    }>
  }
}

interface CleanupResult {
  success: boolean
  error?: string
  data?: {
    preview: false
    before: { total: number }
    after: { total: number; verified: number }
    deleted: number
    duplicateGroups: number
  }
}

export function CleanupDuplicatesButton() {
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isLoadingCleanup, setIsLoadingCleanup] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<CleanupResult | null>(null)

  const handlePreview = async () => {
    setIsLoadingPreview(true)
    setPreviewData(null)

    try {
      const response = await cleanupDuplicateFacesAction(true)

      if (response.error) {
        setPreviewData({ success: false, error: response.error })
      } else {
        setPreviewData({ success: true, data: response.data as any })
      }
    } catch (error) {
      setPreviewData({ success: false, error: "Не удалось загрузить предпросмотр" })
    } finally {
      setIsLoadingPreview(false)
      setShowPreview(true)
    }
  }

  const handleCleanup = async () => {
    setIsLoadingCleanup(true)
    setResult(null)
    setShowConfirm(false)

    try {
      const response = await cleanupDuplicateFacesAction(false)

      if (response.error) {
        setResult({ success: false, error: response.error })
      } else {
        setResult({ success: true, data: response.data as any })
      }
    } catch (error) {
      setResult({ success: false, error: "Не удалось выполнить очистку" })
    } finally {
      setIsLoadingCleanup(false)
      setShowResult(true)
      setShowPreview(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={handlePreview} disabled={isLoadingPreview || isLoadingCleanup}>
        {isLoadingPreview ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Анализ...
          </>
        ) : (
          <>
            <Eye className="mr-2 h-4 w-4" />
            Проверить дубликаты
          </>
        )}
      </Button>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Предпросмотр дубликатов
            </DialogTitle>
            <DialogDescription>
              {previewData?.success
                ? "Обнаружены дублирующие записи для одной комбинации человек+фото"
                : "Произошла ошибка"}
            </DialogDescription>
          </DialogHeader>

          {previewData?.success && previewData.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-3xl font-bold">{previewData.data.totalRecords.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Всего записей</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-3xl font-bold">{previewData.data.duplicateGroups.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Групп дубликатов</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-3xl font-bold text-orange-600">
                    {previewData.data.recordsToDelete.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">Будет удалено</div>
                </div>
              </div>

              {previewData.data.recordsToDelete > 0 ? (
                <>
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-orange-800">Примеры дубликатов (первые 50 групп)</p>
                        <p className="text-sm text-orange-600 mt-1">
                          Для каждой группы будет сохранена лучшая запись (verified → confidence → oldest)
                        </p>
                      </div>
                    </div>
                  </div>

                  <ScrollArea className="h-[300px] rounded-lg border p-4">
                    <div className="space-y-3">
                      {previewData.data.previewGroups.map((group, idx) => (
                        <div key={idx} className="rounded-lg border bg-muted/50 p-3 text-sm">
                          <div className="font-medium mb-2">
                            Группа {idx + 1}: {group.totalRecords} записей
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-2 text-green-700">
                              <CheckCircle2 className="h-3 w-3" />
                              <span className="font-medium">Сохранить:</span>
                              <span>
                                verified={group.keeper.verified ? "✓" : "✗"}, confidence=
                                {group.keeper.confidence?.toFixed(3) || "N/A"}
                              </span>
                            </div>
                            {group.toDelete.map((record, i) => (
                              <div key={i} className="flex items-center gap-2 text-red-700 ml-4">
                                <XCircle className="h-3 w-3" />
                                <span>
                                  Удалить: verified={record.verified ? "✓" : "✗"}, confidence=
                                  {record.confidence?.toFixed(3) || "N/A"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-blue-600 mb-2" />
                  <p className="font-medium text-blue-800">Дубликатов не найдено!</p>
                  <p className="text-sm text-blue-600">База данных в порядке</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-red-800">{previewData?.error || "Неизвестная ошибка"}</p>
            </div>
          )}

          <DialogFooter>
            {previewData?.success && previewData.data && previewData.data.recordsToDelete > 0 ? (
              <>
                <Button variant="outline" onClick={() => setShowPreview(false)}>
                  Отмена
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowPreview(false)
                    setShowConfirm(true)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Удалить {previewData.data.recordsToDelete} записей
                </Button>
              </>
            ) : (
              <Button onClick={() => setShowPreview(false)}>Закрыть</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердить удаление дубликатов?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет удалено {previewData?.data?.recordsToDelete || 0} дублирующих записей из{" "}
              {previewData?.data?.duplicateGroups || 0} групп. Это действие необратимо!
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleCleanup} disabled={isLoadingCleanup}>
              {isLoadingCleanup ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Result Dialog */}
      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {result?.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              Удаление дубликатов
            </DialogTitle>
            <DialogDescription>{result?.success ? "Операция завершена успешно" : "Произошла ошибка"}</DialogDescription>
          </DialogHeader>

          {result?.success && result.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-3xl font-bold">{result.data.before.total.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Записей до очистки</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-3xl font-bold">{result.data.after.total.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Записей после</div>
                </div>
              </div>

              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-green-700">Групп дубликатов:</span>
                    <span className="ml-2 font-bold text-green-800">{result.data.duplicateGroups}</span>
                  </div>
                  <div>
                    <span className="text-green-700">Удалено записей:</span>
                    <span className="ml-2 font-bold text-green-800">{result.data.deleted}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-green-700">Верифицировано:</span>
                    <span className="ml-2 font-bold text-green-800">{result.data.after.verified}</span>
                  </div>
                </div>
              </div>

              {result.data.deleted === 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-blue-600 mb-2" />
                  <p className="font-medium text-blue-800">Дубликатов не найдено!</p>
                  <p className="text-sm text-blue-600">База данных в порядке</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-red-800">{result?.error || "Неизвестная ошибка"}</p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowResult(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
