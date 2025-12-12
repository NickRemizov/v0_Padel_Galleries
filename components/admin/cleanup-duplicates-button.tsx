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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Loader2, CheckCircle2, XCircle, Trash2 } from "lucide-react"

interface CleanupResult {
  success: boolean
  error?: string
  data?: {
    before: { total: number }
    after: { total: number; verified: number }
    deleted: number
    duplicateGroups: number
  }
}

export function CleanupDuplicatesButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [result, setResult] = useState<CleanupResult | null>(null)

  const handleCleanup = async () => {
    setIsLoading(true)
    setResult(null)

    try {
      const response = await cleanupDuplicateFacesAction()

      if (response.error) {
        setResult({ success: false, error: response.error })
      } else {
        setResult({ success: true, data: response.data })
      }
    } catch (error) {
      setResult({ success: false, error: "Не удалось выполнить очистку" })
    } finally {
      setIsLoading(false)
      setShowResult(true)
    }
  }

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Обработка...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить дубликаты
              </>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить дубликаты записей?</AlertDialogTitle>
            <AlertDialogDescription>
              Эта операция удалит все дублирующие записи в таблице photo_faces (несколько записей для одной комбинации
              человек+фото). Для каждой группы дубликатов будет сохранена лучшая запись (с verified=true или наибольшей
              уверенностью).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleCleanup}>Удалить дубликаты</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
