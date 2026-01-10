"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { CleanupDuplicatesButton } from "@/components/admin/cleanup-duplicates-button"
import { SyncVerifiedButton } from "@/components/admin/sync-verified-button"
import { DebugPersonPhotos } from "@/components/admin/debug-person-photos"
import { DatabaseIntegrityChecker } from "@/components/admin/database-integrity"
import { RegenerateDescriptorsDialog } from "@/components/admin/regenerate-descriptors-dialog"
import { BatchRecognitionDialog } from "@/components/admin/batch-recognition"
import { GlobalUnknownFacesDialog } from "@/components/admin/global-unknown-faces-dialog"
import { ConsistencyAuditDialog } from "@/components/admin/consistency-audit-dialog"
import { IndexStatusCard } from "@/components/admin/index-status-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Database, Bug, Wrench, Shield, RefreshCw, Scan, Users, Images, Search, Loader2, AlertTriangle } from "lucide-react"
import { recognizeUnknownFacesAction } from "@/app/admin/actions/faces"

interface RecognizeResult {
  total_unknown: number
  recognized_count: number
  by_person: Array<{ person_id: string; name: string; count: number }>
  index_rebuilt: boolean
}

export function ServiceManager() {
  const [showRegenerateDescriptors, setShowRegenerateDescriptors] = useState(false)
  const [showBatchRecognition, setShowBatchRecognition] = useState(false)
  const [showGlobalUnknownFaces, setShowGlobalUnknownFaces] = useState(false)
  const [showConsistencyAudit, setShowConsistencyAudit] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [recognizeResult, setRecognizeResult] = useState<RecognizeResult | null>(null)
  const [showRecognizeResult, setShowRecognizeResult] = useState(false)

  const handleComingSoon = (feature: string) => {
    alert(`${feature} - в разработке`)
  }

  const handleRecognizeUnknown = async () => {
    setRecognizing(true)
    try {
      const result = await recognizeUnknownFacesAction()
      if (result.success) {
        setRecognizeResult({
          total_unknown: result.total_unknown ?? 0,
          recognized_count: result.recognized_count ?? 0,
          by_person: result.by_person ?? [],
          index_rebuilt: result.index_rebuilt ?? false,
        })
        setShowRecognizeResult(true)
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    } catch (error) {
      alert(`Ошибка: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRecognizing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Пакетное распознавание */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            <CardTitle>Пакетное распознавание</CardTitle>
          </div>
          <CardDescription>
            Массовое распознавание лиц и кластеризация неизвестных лиц по всей базе
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Распознать галереи</div>
                <div className="text-sm text-muted-foreground">
                  Выбрать галереи с необработанными фото и запустить распознавание
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowBatchRecognition(true)}>
                <Images className="mr-2 h-4 w-4" />
                Распознать
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Найти известные лица</div>
                <div className="text-sm text-muted-foreground">
                  Прогнать все неизвестные лица через алгоритм распознавания (полезно после добавления нового игрока)
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRecognizeUnknown}
                disabled={recognizing}
              >
                {recognizing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Поиск...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Найти
                  </>
                )}
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Неизвестные лица</div>
                <div className="text-sm text-muted-foreground">
                  Кластеризация всех нераспознанных лиц по всей базе для группового назначения
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowGlobalUnknownFaces(true)}>
                <Users className="mr-2 h-4 w-4" />
                Кластеризация
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Индекс распознавания */}
      <IndexStatusCard />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            <CardTitle>Проверка целостности базы данных</CardTitle>
          </div>
          <CardDescription>
            Диагностика и исправление нарушений целостности данных в системе распознавания лиц
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DatabaseIntegrityChecker />
        </CardContent>
      </Card>

      {/* Обслуживание базы данных */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>Обслуживание базы данных</CardTitle>
          </div>
          <CardDescription>Инструменты для очистки и оптимизации базы данных распознавания лиц</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {/* Removed "Очистка дублирующихся дескрипторов" button */}
            {/* This was for LEGACY face_descriptors table which is no longer used */}

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Удаление дубликатов записей</div>
                <div className="text-sm text-muted-foreground">
                  Удалить несколько записей для одной комбинации человек+фото
                </div>
              </div>
              <CleanupDuplicatesButton />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Синхронизация verified/confidence/processed</div>
                <div className="text-sm text-muted-foreground">
                  Исправить несоответствия в полях verified, confidence и has_been_processed
                </div>
              </div>
              <SyncVerifiedButton />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Восстановить дескрипторы</div>
                <div className="text-sm text-muted-foreground">
                  Регенерация дескрипторов для лиц с привязанным игроком, но без дескриптора (назначены вручную без
                  детекции)
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowRegenerateDescriptors(true)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Восстановить
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Аудит эмбеддингов игроков</div>
                <div className="text-sm text-muted-foreground">
                  Проверка консистентности дескрипторов всех игроков для поиска outliers (плохих эмбеддингов)
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowConsistencyAudit(true)}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Аудит
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Отладка */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            <CardTitle>Отладка</CardTitle>
          </div>
          <CardDescription>Инструменты для диагностики и отладки системы распознавания</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Проверка фото человека</div>
              <div className="text-sm text-muted-foreground">
                Отладочная информация о фото конкретного человека или файла
              </div>
            </div>
            <DebugPersonPhotos />
          </div>
        </CardContent>
      </Card>

      {/* Инструменты (в разработке) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            <CardTitle>Инструменты</CardTitle>
          </div>
          <CardDescription>Дополнительные инструменты для работы с системой (в разработке)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Экспорт данных</div>
                <div className="text-sm text-muted-foreground">Экспорт списка людей и статистики в CSV/JSON</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleComingSoon("Экспорт данных")}>
                Экспорт
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Логи системы</div>
                <div className="text-sm text-muted-foreground">Просмотр последних операций и событий</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleComingSoon("Логи системы")}>
                Открыть логи
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Backup/Restore</div>
                <div className="text-sm text-muted-foreground">Резервное копирование и восстановление базы данных</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleComingSoon("Backup/Restore")}>
                Управление
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      {showRegenerateDescriptors && (
        <RegenerateDescriptorsDialog open={showRegenerateDescriptors} onOpenChange={setShowRegenerateDescriptors} />
      )}

      <BatchRecognitionDialog
        open={showBatchRecognition}
        onOpenChange={setShowBatchRecognition}
      />

      <GlobalUnknownFacesDialog
        open={showGlobalUnknownFaces}
        onOpenChange={setShowGlobalUnknownFaces}
      />

      <ConsistencyAuditDialog
        open={showConsistencyAudit}
        onOpenChange={setShowConsistencyAudit}
      />

      {/* Recognize Unknown Result Dialog */}
      <Dialog open={showRecognizeResult} onOpenChange={setShowRecognizeResult}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Результаты поиска известных лиц</DialogTitle>
            <DialogDescription>
              Проверено {recognizeResult?.total_unknown ?? 0} неизвестных лиц
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-3xl font-bold text-primary">
                  {recognizeResult?.recognized_count ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">Распознано</div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-3xl font-bold">
                  {(recognizeResult?.total_unknown ?? 0) - (recognizeResult?.recognized_count ?? 0)}
                </div>
                <div className="text-sm text-muted-foreground">Осталось неизвестных</div>
              </div>
            </div>

            {recognizeResult?.by_person && recognizeResult.by_person.length > 0 && (
              <div>
                <div className="font-medium mb-2">По игрокам:</div>
                <div className="max-h-[200px] overflow-y-auto space-y-1">
                  {recognizeResult.by_person.map((item) => (
                    <div 
                      key={item.person_id} 
                      className="flex justify-between items-center py-1 px-2 bg-muted/50 rounded"
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="font-medium text-primary ml-2">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recognizeResult?.recognized_count === 0 && (
              <div className="text-center text-muted-foreground py-4">
                Новых совпадений не найдено
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setShowRecognizeResult(false)}>
              Закрыть
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
