"use client"

/**
 * Database Integrity Checker Component
 * 
 * @migrated 2025-12-27 - Removed direct Supabase browser client
 * Now uses /api/admin/training/config (FastAPI) instead of browser Supabase
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wrench,
  ChevronDown,
  ChevronRight,
  Info,
  Check,
  Trash2,
  Users,
} from "lucide-react"
import {
  checkDatabaseIntegrityAction,
  fixIntegrityIssueAction,
  confirmFaceAction,
  rejectFaceAction,
} from "@/app/admin/actions/integrity"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import FaceCropPreview from "@/components/FaceCropPreview"
import { FaceTaggingDialog } from "@/components/admin/face-tagging-dialog"
import { DuplicatePeopleDialog } from "@/components/admin/duplicate-people-dialog"

interface IntegrityReport {
  stats: {
    totalGalleries: number
    totalPhotos: number
    totalPhotoFaces: number
    totalPeople: number
    totalConfigs: number
    totalEventPlayers: number
    totalTelegramBots: number
  }
  photoFaces: {
    verifiedWithoutPerson: number
    verifiedWithWrongConfidence: number
    personWithoutConfidence: number
    nonExistentPerson: number
    nonExistentPhoto: number
    orphanedLinks: number
    unrecognizedFaces: number
  }
  people: {
    withoutFaces: number
    duplicatePeople: number
  }
  totalIssues: number
  checksPerformed: number
  details: Record<string, any[]>
}

export function DatabaseIntegrityChecker() {
  const [isChecking, setIsChecking] = useState(false)
  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [fixingIssue, setFixingIssue] = useState<string | null>(null)
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set())
  const [processingFaces, setProcessingFaces] = useState<Set<string>>(new Set())
  const [removedFaces, setRemovedFaces] = useState<Set<string>>(new Set())
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.6)
  const [taggingDialogOpen, setTaggingDialogOpen] = useState(false)
  const [selectedPhotoForTagging, setSelectedPhotoForTagging] = useState<{
    imageId: string
    imageUrl: string
  } | null>(null)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)

  useEffect(() => {
    // Load confidence threshold from settings via API (no browser Supabase)
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/admin/training/config")
        if (response.ok) {
          const result = await response.json()
          // Unified format: {success, data, error, code}
          if (result.success && result.data?.confidence_thresholds?.high_data) {
            setConfidenceThreshold(result.data.confidence_thresholds.high_data)
          }
        }
      } catch (error) {
        console.error("[IntegrityChecker] Failed to load settings:", error)
      }
    }
    loadSettings()
    // NOTE: Auto-check removed to avoid Vercel timeout (60s limit)
    // User must manually click "Запустить проверку"
  }, [])

  const handleCheck = async () => {
    setIsChecking(true)
    setRemovedFaces(new Set())
    try {
      const result = await checkDatabaseIntegrityAction()
      if (result.success && result.data) {
        setReport(result.data)
      } else {
        alert(`Ошибка проверки: ${result.error}`)
      }
    } catch (error: any) {
      // Better error handling for timeouts
      const message = error.message || String(error)
      if (message.includes("Failed to fetch") || message.includes("timeout")) {
        alert("Превышено время ожидания (60 сек). База слишком большая для онлайн-проверки.\n\nПопробуйте позже или обратитесь к администратору.")
      } else {
        alert(`Ошибка: ${message}`)
      }
    } finally {
      setIsChecking(false)
    }
  }

  const handleFix = async (issueType: string) => {
    const dangerousFixes = ["cleanupUnverifiedFaces"]
    const confirmMessage = dangerousFixes.includes(issueType)
      ? `⚠️ ВНИМАНИЕ! Это опасная операция - она удалит все неопознанные лица.\n\nВы уверены, что хотите продолжить?`
      : `Исправить проблему "${issueType}"?\n\nЭто действие необратимо, но безопасно.`

    if (!confirm(confirmMessage)) {
      return
    }

    setFixingIssue(issueType)
    try {
      const result = await fixIntegrityIssueAction(issueType)
      if (result.success) {
        const message = result.data?.message || `Исправлено: ${result.data?.fixed || 0} записей`
        alert(message)
        await handleCheck()
      } else {
        alert(`Ошибка исправления: ${result.error}`)
      }
    } catch (error: any) {
      alert(`Ошибка: ${error.message}`)
    } finally {
      setFixingIssue(null)
    }
  }

  const handleCheckIssue = async (issueType: string) => {
    setProcessingFaces((prev) => new Set(prev).add(issueType))
    try {
      setExpandedIssues((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(issueType)) {
          newSet.delete(issueType)
        } else {
          newSet.add(issueType)
        }
        return newSet
      })
    } finally {
      setProcessingFaces((prev) => {
        const newSet = new Set(prev)
        newSet.delete(issueType)
        return newSet
      })
    }
  }

  const handleConfirmFace = async (faceId: string, actionType: "verify" | "elevate", item?: any) => {
    // Для verifiedWithoutPerson - открываем FaceTaggingDialog
    if (actionType === "verify" && item?.photo_id && item?.image_url) {
      try {
        await rejectFaceAction(faceId, "unverify")
      } catch (error) {
        console.error("[IntegrityChecker] Failed to unverify before tagging:", error)
      }
      setSelectedPhotoForTagging({
        imageId: item.photo_id,
        imageUrl: item.image_url,
      })
      setTaggingDialogOpen(true)
      return
    }

    // Для остальных случаев (elevate) - стандартная обработка
    setProcessingFaces((prev) => new Set(prev).add(faceId))
    try {
      const result = await confirmFaceAction(faceId, actionType, confidenceThreshold)
      if (result.success) {
        setRemovedFaces((prev) => new Set(prev).add(faceId))
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    } catch (error: any) {
      alert(`Ошибка: ${error.message}`)
    } finally {
      setProcessingFaces((prev) => {
        const newSet = new Set(prev)
        newSet.delete(faceId)
        return newSet
      })
    }
  }

  const handleRejectFace = async (faceId: string, actionType: "unverify" | "unlink") => {
    setProcessingFaces((prev) => new Set(prev).add(faceId))
    try {
      const result = await rejectFaceAction(faceId, actionType)
      if (result.success) {
        setRemovedFaces((prev) => new Set(prev).add(faceId))
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    } catch (error: any) {
      alert(`Ошибка: ${error.message}`)
    } finally {
      setProcessingFaces((prev) => {
        const newSet = new Set(prev)
        newSet.delete(faceId)
        return newSet
      })
    }
  }

  const handleTaggingDialogClose = () => {
    setTaggingDialogOpen(false)
    setSelectedPhotoForTagging(null)
  }

  const handleTaggingSave = () => {
    handleCheck()
  }

  const handleDuplicateDialogClose = (open: boolean) => {
    setDuplicateDialogOpen(open)
    if (!open) {
      // Перезапускаем проверку после закрытия диалога
      handleCheck()
    }
  }

  const formatShortDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return ""
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ""
      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      return `${day}.${month}`
    } catch {
      return ""
    }
  }

  const FaceCard = ({
    item,
    issueType,
    showConfidence = false,
    showVerified = false,
    hasActions = false,
  }: {
    item: any
    issueType: string
    showConfidence?: boolean
    showVerified?: boolean
    hasActions?: boolean
  }) => {
    if (removedFaces.has(item.id)) return null

    const isProcessing = processingFaces.has(item.id)
    const confirmAction = issueType === "verifiedWithoutPerson" ? "verify" : "elevate"
    const rejectAction = issueType === "verifiedWithoutPerson" ? "unverify" : "unlink"

    const shortDate = formatShortDate(item.shoot_date)
    const galleryWithDate = item.gallery_title
      ? shortDate
        ? `${item.gallery_title} ${shortDate}`
        : item.gallery_title
      : null

    return (
      <div className="bg-background p-1.5 rounded border space-y-1 relative">
        <div className="relative w-full aspect-square bg-muted rounded overflow-hidden">
          {item.bbox && item.image_url ? (
            <div className="w-full h-full">
              <FaceCropPreview imageUrl={item.image_url} bbox={item.bbox} size={200} />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">
              {item.photo_exists === false ? "Фото удалено" : "Нет превью"}
            </div>
          )}
          {hasActions && !isProcessing && (
            <>
              <button
                onClick={() => handleConfirmFace(item.id, confirmAction, item)}
                className="absolute top-1 left-1 w-7 h-7 bg-green-500 hover:bg-green-600 rounded flex items-center justify-center text-white shadow-md transition-colors"
                title={
                  confirmAction === "verify"
                    ? "Тегировать лицо"
                    : `Установить confidence ${Math.round(confidenceThreshold * 100)}%`
                }
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleRejectFace(item.id, rejectAction)}
                className="absolute top-1 right-1 w-7 h-7 bg-red-500 hover:bg-red-600 rounded flex items-center justify-center text-white shadow-md transition-colors"
                title={rejectAction === "unverify" ? "Убрать верификацию" : "Убрать привязку к игроку"}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="text-xs space-y-0.5 leading-tight">
          {(item.person_name || item.real_name) && (
            <div className="truncate">
              <span className="text-muted-foreground">Игрок:</span>{" "}
              <span className="font-medium">{item.person_name || item.real_name}</span>
            </div>
          )}
          {galleryWithDate && (
            <div className="truncate">
              <span className="text-muted-foreground">Галерея:</span> <span>{galleryWithDate}</span>
            </div>
          )}
          {item.filename && (
            <div className="truncate">
              <span className="text-muted-foreground">Файл:</span> <span>{item.filename}</span>
            </div>
          )}
          {showConfidence && item.confidence !== undefined && item.confidence !== null && (
            <div>Уверенность: {(item.confidence * 100).toFixed(0)}%</div>
          )}
          {showVerified && item.verified !== undefined && <div>Верифицирован: {item.verified ? "Да" : "Нет"}</div>}
          {item.photo_exists === false && <div className="text-orange-600 font-medium">⚠️ Фото удалено</div>}
          {item.count && <div className="font-medium text-orange-600">Дублей: {item.count} записей</div>}
        </div>
      </div>
    )
  }

  const IssueRow = ({
    title,
    count,
    issueType,
    description,
    severity = "medium",
    canFix = true,
    infoOnly = false,
    checked = false,
    showConfidence = false,
    showVerified = false,
    hasActions = false,
    maxItems = 40,
    simpleCards = false,
    customDetailsButton = false,
    onCustomDetails,
  }: {
    title: string
    count: number
    issueType: string
    description: string
    severity?: "critical" | "high" | "medium" | "low"
    canFix?: boolean
    infoOnly?: boolean
    checked?: boolean
    showConfidence?: boolean
    showVerified?: boolean
    hasActions?: boolean
    maxItems?: number
    simpleCards?: boolean
    customDetailsButton?: boolean
    onCustomDetails?: () => void
  }) => {
    const isExpanded = expandedIssues.has(issueType)
    const details = report?.details?.[issueType] || []
    const hasDetails = details.length > 0

    const severityVariant = {
      critical: "destructive" as const,
      high: "destructive" as const,
      medium: "default" as const,
      low: "secondary" as const,
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between py-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {infoOnly && <Info className="h-4 w-4 text-muted-foreground" />}
              <span className="font-medium">{title}</span>
              {checked ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  OK
                </Badge>
              ) : (
                <Badge variant={severityVariant[severity]}>{count}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            {!checked && customDetailsButton && onCustomDetails && (
              <Button variant="outline" size="sm" onClick={onCustomDetails}>
                <Users className="mr-2 h-4 w-4" />
                Просмотреть дубликаты
              </Button>
            )}
            {!checked && !customDetailsButton && hasDetails && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCheckIssue(issueType)}
                disabled={processingFaces.has(issueType)}
              >
                {processingFaces.has(issueType) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Проверка...
                  </>
                ) : (
                  <>
                    {isExpanded ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}
                    Детали
                  </>
                )}
              </Button>
            )}
            {!checked && canFix && !infoOnly && !customDetailsButton && (
              <Button variant="outline" size="sm" onClick={() => handleFix(issueType)} disabled={fixingIssue !== null}>
                {fixingIssue === issueType ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Исправление...
                  </>
                ) : (
                  <>
                    <Wrench className="mr-2 h-4 w-4" />
                    Исправить
                  </>
                )}
              </Button>
            )}
            {infoOnly && !checked && !customDetailsButton && (
              <Badge variant="outline" className="text-muted-foreground">
                Только информация
              </Badge>
            )}
          </div>
        </div>
        {isExpanded && hasDetails && !customDetailsButton && (
          <div className="ml-4 p-3 bg-muted rounded-lg space-y-2">
            <div className="text-sm font-medium">
              Найдено записей: {details.length}
              {hasActions && " (✓ → Принять/Исправить, 🗑 → Отклонить)"}
            </div>
            {simpleCards ? (
              <div className="grid grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
                {details.slice(0, maxItems).map((item: any, index: number) => (
                  <div key={item.id || index} className="bg-background p-3 rounded border space-y-2">
                    {item.bbox && item.image_url ? (
                      <div className="relative w-full aspect-square bg-muted rounded overflow-hidden">
                        <FaceCropPreview imageUrl={item.image_url} bbox={item.bbox} size={200} />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">
                        {item.photo_exists === false ? "Фото удалено" : "Нет превью"}
                      </div>
                    )}
                    <div className="text-xs space-y-1">
                      {item.real_name && <div className="font-medium">Игрок: {item.real_name}</div>}
                      {item.person_name && <div className="font-medium">Игрок: {item.person_name}</div>}
                      {item.name && <div className="font-medium">Игрок: {item.name}</div>}
                      {item.telegram_username && (
                        <div className="text-muted-foreground">Telegram: @{item.telegram_username}</div>
                      )}
                      {item.gallery_title && <div className="text-muted-foreground">Галерея: {item.gallery_title}</div>}
                      {item.confidence !== undefined && item.confidence !== null && (
                        <div>Уверенность: {(item.confidence * 100).toFixed(0)}%</div>
                      )}
                      {item.verified !== undefined && <div>Верифицирован: {item.verified ? "Да" : "Нет"}</div>}
                      {item.count && <div className="font-medium text-orange-600">Дублей: {item.count} записей</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`grid gap-2 max-h-[500px] overflow-y-auto ${hasActions ? "grid-cols-6" : "grid-cols-4"}`}>
                {details.slice(0, maxItems).map((item: any, index: number) => (
                  <FaceCard
                    key={item.id || index}
                    item={item}
                    issueType={issueType}
                    showConfidence={showConfidence}
                    showVerified={showVerified}
                    hasActions={hasActions}
                  />
                ))}
              </div>
            )}
            {details.length > maxItems && (
              <div className="text-xs text-muted-foreground">... и еще {details.length - maxItems} записей</div>
            )}
          </div>
        )}
        <Separator />
      </div>
    )
  }

  // Компонент для отображения списка игроков без фото
  const PeopleWithoutFacesRow = () => {
    const names = report?.details?.peopleWithoutFaces || []
    const count = report?.people?.withoutFaces || 0

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between py-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Игроки без фото</span>
              {count === 0 ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  OK
                </Badge>
              ) : (
                <Badge variant="secondary">{count}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Игроки, которым не назначено ни одного фото
            </p>
          </div>
          <Badge variant="outline" className="text-muted-foreground">
            Только информация
          </Badge>
        </div>
        {count > 0 && names.length > 0 && (
          <div className="ml-4 p-3 bg-muted rounded-lg">
            <div className="text-sm leading-relaxed">
              {names.join(", ")}
            </div>
          </div>
        )}
        <Separator />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Проверка целостности базы данных</CardTitle>
          <CardDescription>
            Проверка и исправление нарушений целостности данных в системе распознавания лиц.
            Проверка может занять до 60 секунд при большом объёме данных.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleCheck} disabled={isChecking} className="w-full">
            {isChecking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Проверка... (может занять до 60 сек)
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Запустить проверку
              </>
            )}
          </Button>
          {!report && !isChecking && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Нажмите кнопку для начала проверки</AlertTitle>
              <AlertDescription>
                Проверка анализирует всю базу данных и может занять некоторое время
              </AlertDescription>
            </Alert>
          )}
          {report && (
            <Alert variant={report.totalIssues > 0 ? "destructive" : "default"}>
              {report.totalIssues > 0 ? (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Обнаружено проблем: {report.totalIssues}</AlertTitle>
                  <AlertDescription>
                    Рекомендуется исправить проблемы для корректной работы системы распознавания
                  </AlertDescription>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Проблем не обнаружено</AlertTitle>
                  <AlertDescription>База данных в порядке</AlertDescription>
                </>
              )}
            </Alert>
          )}
        </CardContent>
      </Card>
      {report && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>📊 Статистика базы данных</CardTitle>
              <CardDescription>Общая информация о количестве записей в базе</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Галереи</div>
                  <div className="text-2xl font-bold">{report.stats.totalGalleries}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Фото</div>
                  <div className="text-2xl font-bold">{report.stats.totalPhotos}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Лица на фото</div>
                  <div className="text-2xl font-bold">{report.stats.totalPhotoFaces}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Игроки</div>
                  <div className="text-2xl font-bold">{report.stats.totalPeople}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Настройки</div>
                  <div className="text-2xl font-bold">{report.stats.totalConfigs}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Игроки событий</div>
                  <div className="text-2xl font-bold">{report.stats.totalEventPlayers}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Telegram боты</div>
                  <div className="text-2xl font-bold">{report.stats.totalTelegramBots}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Проверок</div>
                  <div className="text-2xl font-bold">{report.checksPerformed}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Проблемы с лицами на фото (Photo Faces)</CardTitle>
              <CardDescription>
                Всего проблем:{" "}
                {report.photoFaces.verifiedWithoutPerson +
                  report.photoFaces.verifiedWithWrongConfidence +
                  report.photoFaces.personWithoutConfidence +
                  report.photoFaces.nonExistentPerson +
                  report.photoFaces.nonExistentPhoto +
                  (report.photoFaces.orphanedLinks || 0)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <IssueRow
                  title="Верифицированные лица без игрока"
                  count={report.photoFaces.verifiedWithoutPerson}
                  issueType="verifiedWithoutPerson"
                  description="Verified=True, но person_id=null. Исправить → на всех лицах удалить Verified"
                  severity="critical"
                  canFix={true}
                  checked={report.photoFaces.verifiedWithoutPerson === 0}
                  hasActions={true}
                  maxItems={30}
                />
                <IssueRow
                  title="Потерянные связи (не видны в галерее игрока)"
                  count={report.photoFaces.orphanedLinks || 0}
                  issueType="orphanedLinks"
                  description={`Привязаны к игроку, но confidence < ${Math.round(confidenceThreshold * 100)}%`}
                  severity="high"
                  canFix={true}
                  checked={(report.photoFaces.orphanedLinks || 0) === 0}
                  showConfidence={true}
                  showVerified={true}
                  hasActions={true}
                  maxItems={30}
                />
                <IssueRow
                  title="Лица с игроком без confidence"
                  count={report.photoFaces.personWithoutConfidence}
                  issueType="personWithoutConfidence"
                  description="Лица с person_id, но confidence = null → Автофикс: устанавливает confidence=0.5"
                  severity="medium"
                  canFix={true}
                  checked={report.photoFaces.personWithoutConfidence === 0}
                />
                <IssueRow
                  title="Лица с несуществующим игроком"
                  count={report.photoFaces.nonExistentPerson}
                  issueType="nonExistentPersonFaces"
                  description="person_id ссылается на удаленного игрока → Автофикс: обнуляет person_id"
                  severity="critical"
                  canFix={true}
                  checked={report.photoFaces.nonExistentPerson === 0}
                />
                <IssueRow
                  title="Лица с несуществующим фото"
                  count={report.photoFaces.nonExistentPhoto}
                  issueType="nonExistentPhotoFaces"
                  description="photo_id ссылается на удаленное фото → Автофикс: удаляет запись"
                  severity="critical"
                  canFix={true}
                  checked={report.photoFaces.nonExistentPhoto === 0}
                />
                <IssueRow
                  title="Нераспознанные лица"
                  count={report.photoFaces.unrecognizedFaces || 0}
                  issueType="unrecognizedFaces"
                  description="Лица с дескриптором, но без привязки к игроку. Это нормально — ожидают распознавания или ручного тегирования"
                  severity="low"
                  canFix={false}
                  infoOnly={true}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Информация об игроках (People)</CardTitle>
              <CardDescription>
                Найдено групп дубликатов: {report.people.duplicatePeople}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <IssueRow
                  title="Дубликаты игроков"
                  count={report.people.duplicatePeople}
                  issueType="duplicatePeople"
                  description="Игроки с совпадающими контактами (Gmail, Telegram, Facebook, Instagram)"
                  severity="high"
                  canFix={false}
                  checked={report.people.duplicatePeople === 0}
                  customDetailsButton={report.people.duplicatePeople > 0}
                  onCustomDetails={() => setDuplicateDialogOpen(true)}
                />
                <PeopleWithoutFacesRow />
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {selectedPhotoForTagging && (
        <FaceTaggingDialog
          imageId={selectedPhotoForTagging.imageId}
          imageUrl={selectedPhotoForTagging.imageUrl}
          open={taggingDialogOpen}
          onOpenChange={handleTaggingDialogClose}
          onSave={handleTaggingSave}
        />
      )}
      <DuplicatePeopleDialog 
        open={duplicateDialogOpen} 
        onOpenChange={handleDuplicateDialogClose} 
      />
    </div>
  )
}
