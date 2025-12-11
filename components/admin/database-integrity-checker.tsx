"use client"

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
} from "lucide-react"
import {
  checkDatabaseIntegrityAction,
  fixIntegrityIssueAction,
  confirmFaceAction,
  rejectFaceAction,
} from "@/app/admin/actions/integrity"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import FaceCropPreview from "@/components/FaceCropPreview"
import { createClient } from "@/lib/supabase/client"
import { FaceTaggingDialog } from "@/components/admin/face-tagging-dialog"

interface IntegrityReport {
  photoFaces: {
    verifiedWithoutPerson: number
    verifiedWithWrongConfidence: number
    personWithoutConfidence: number
    nonExistentPerson: number
    nonExistentPhoto: number
    orphanedLinks: number
  }
  people: {
    withoutDescriptors: number
    withoutFaces: number
    duplicateNames: number
  }
  totalIssues: number
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
  const [isFaceTaggingDialogOpen, setIsFaceTaggingDialogOpen] = useState(false)
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null)

  const supabaseClient = createClient()

  useEffect(() => {
    // Initial check on component mount
    handleCheck()
    // Загружаем порог confidence из face_recognition_config
    const loadSettings = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from("face_recognition_config")
          .select("value")
          .eq("key", "recognition_settings")
          .single()

        if (data?.value?.confidence_thresholds?.high_data) {
          setConfidenceThreshold(data.value.confidence_thresholds.high_data)
        }
      } catch (error) {
        console.error("[IntegrityChecker] Failed to load settings:", error)
      }
    }
    loadSettings()
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
      alert(`Ошибка: ${error.message}`)
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

  const handleOpenFaceTaggingDialog = (faceId: string) => {
    setSelectedFaceId(faceId)
    setIsFaceTaggingDialogOpen(true)
  }

  const handleCloseFaceTaggingDialog = () => {
    setSelectedFaceId(null)
    setIsFaceTaggingDialogOpen(false)
  }

  const handleTaggingDialogClose = () => {
    setTaggingDialogOpen(false)
    setSelectedPhotoForTagging(null)
  }

  const handleTaggingSave = () => {
    handleCheck()
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
          {item.bbox && item.image_url && (
            <div className="w-full h-full">
              <FaceCropPreview imageUrl={item.image_url} bbox={item.bbox} size={200} />
            </div>
          )}
          {hasActions && !isProcessing && (
            <>
              <button
                onClick={() => handleConfirmFace(item.id, confirmAction, item)}
                className="absolute top-1 left-1 w-5 h-5 bg-green-500 hover:bg-green-600 rounded flex items-center justify-center text-white shadow-md transition-colors"
                title={
                  confirmAction === "verify"
                    ? "Тегировать лицо"
                    : `Установить confidence ${Math.round(confidenceThreshold * 100)}%`
                }
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleRejectFace(item.id, rejectAction)}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded flex items-center justify-center text-white shadow-md transition-colors"
                title={rejectAction === "unverify" ? "Снять верификацию" : "Удалить привязку"}
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleOpenFaceTaggingDialog(item.id)}
                className="absolute bottom-1 right-1 w-5 h-5 bg-blue-500 hover:bg-blue-600 rounded flex items-center justify-center text-white shadow-md transition-colors"
                title="Отметить лицо"
              >
                <Info className="w-3 h-3" />
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
    showConfidence = false,
    showVerified = false,
    hasActions = false,
    maxItems = 40,
    simpleCards = false,
  }: {
    title: string
    count: number
    issueType: string
    description: string
    severity?: "critical" | "high" | "medium" | "low"
    canFix?: boolean
    infoOnly?: boolean
    showConfidence?: boolean
    showVerified?: boolean
    hasActions?: boolean
    maxItems?: number
    simpleCards?: boolean
  }) => {
    if (count === 0) return null

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
              <Badge variant={severityVariant[severity]}>{count}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            {hasDetails && (
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
            {canFix && !infoOnly && (
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
            {infoOnly && (
              <Badge variant="outline" className="text-muted-foreground">
                Только информация
              </Badge>
            )}
          </div>
        </div>
        {isExpanded && hasDetails && (
          <div className="ml-4 p-3 bg-muted rounded-lg space-y-2">
            <div className="text-sm font-medium">
              Найдено записей: {details.length}
              {hasActions && " (✓ подтвердить, 🗑 отклонить)"}
            </div>
            {simpleCards ? (
              <div className="grid grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
                {details.slice(0, maxItems).map((item: any, index: number) => (
                  <div key={item.id || index} className="bg-background p-3 rounded border space-y-2">
                    {item.bbox && item.image_url && (
                      <div className="relative w-full aspect-square bg-muted rounded overflow-hidden">
                        <FaceCropPreview imageUrl={item.image_url} bbox={item.bbox} size={200} />
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
                      {item.ids && item.ids.length > 0 && (
                        <div className="text-muted-foreground text-[10px]">
                          IDs:{" "}
                          {item.ids
                            .slice(0, 3)
                            .map((id: string) => id.slice(0, 8))
                            .join(", ")}
                          {item.ids.length > 3 && "..."}
                        </div>
                      )}
                      <div className="font-mono text-[10px] text-muted-foreground pt-1 border-t">
                        {item.id ? `ID: ${item.id.slice(0, 8)}...` : ""}
                        {item.photo_id && ` • Фото: ${item.photo_id.slice(0, 8)}...`}
                        {item.person_id && ` • Персона: ${item.person_id.slice(0, 8)}...`}
                      </div>
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Проверка целостности базы данных</CardTitle>
          <CardDescription>
            Проверка и исправление нарушений целостности данных в системе распознавания лиц
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleCheck} disabled={isChecking} className="w-full">
            {isChecking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Проверка...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Запустить проверку
              </>
            )}
          </Button>
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
      {report && report.totalIssues > 0 && (
        <>
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
                  description="verified=true, но person_id=null → ✓ открыть тегирование, 🗑 снять verified"
                  severity="critical"
                  canFix={true}
                  hasActions={true}
                  maxItems={30}
                />
                <IssueRow
                  title="Потерянные связи (не видны в галерее игрока)"
                  count={report.photoFaces.orphanedLinks || 0}
                  issueType="orphanedLinks"
                  description={`Привязаны к игроку, но confidence < ${Math.round(confidenceThreshold * 100)}% → ✓ установить ${Math.round(confidenceThreshold * 100)}%, 🗑 удалить привязку`}
                  severity="high"
                  canFix={true}
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
                />
                <IssueRow
                  title="Лица с несуществующим игроком"
                  count={report.photoFaces.nonExistentPerson}
                  issueType="nonExistentPersonFaces"
                  description="person_id ссылается на удаленного игрока → Автофикс: обнуляет person_id"
                  severity="critical"
                  canFix={true}
                />
                <IssueRow
                  title="Лица с несуществующим фото"
                  count={report.photoFaces.nonExistentPhoto}
                  issueType="nonExistentPhotoFaces"
                  description="photo_id ссылается на удаленное фото → Автофикс: удаляет запись"
                  severity="critical"
                  canFix={true}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Информация об игроках (People)</CardTitle>
              <CardDescription>
                Всего записей:{" "}
                {report.people.withoutDescriptors + report.people.withoutFaces + report.people.duplicateNames}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <IssueRow
                  title="Игроки без дескрипторов"
                  count={report.people.withoutDescriptors}
                  issueType="peopleWithoutDescriptors"
                  description="Новые игроки, которым еще не назначено ни одного фото (это нормально)"
                  severity="low"
                  canFix={false}
                  infoOnly={true}
                />
                <IssueRow
                  title="Игроки без фото"
                  count={report.people.withoutFaces}
                  issueType="peopleWithoutFaces"
                  description="Игроки без отметок на фото (это нормально, могут быть новыми)"
                  severity="low"
                  canFix={false}
                  infoOnly={true}
                />
                <IssueRow
                  title="Дубликаты имен"
                  count={report.people.duplicateNames}
                  issueType="duplicateNames"
                  description="Несколько игроков с ОДИНАКОВЫМИ именем И telegram (разные ТГ = разные люди, не ошибка)"
                  severity="medium"
                  canFix={false}
                  infoOnly={true}
                />
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
    </div>
  )
}
