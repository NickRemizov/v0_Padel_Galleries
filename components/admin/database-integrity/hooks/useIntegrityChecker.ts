"use client"

import { useState, useEffect, useCallback } from "react"
import {
  checkDatabaseIntegrityAction,
  fixIntegrityIssueAction,
  confirmFaceAction,
  rejectFaceAction,
} from "@/app/admin/actions/integrity"
import type { IntegrityReport } from "../types"

export function useIntegrityChecker() {
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

  // Загрузка настроек при монтировании
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/admin/training/config")
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data?.confidence_thresholds?.high_data) {
            setConfidenceThreshold(result.data.confidence_thresholds.high_data)
          }
        }
      } catch (error) {
        console.error("[IntegrityChecker] Failed to load settings:", error)
      }
    }
    loadSettings()
  }, [])

  // Запуск проверки
  const handleCheck = useCallback(async () => {
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
      const message = error.message || String(error)
      if (message.includes("Failed to fetch") || message.includes("timeout")) {
        alert("Превышено время ожидания (60 сек). База слишком большая для онлайн-проверки.\n\nПопробуйте позже или обратитесь к администратору.")
      } else {
        alert(`Ошибка: ${message}`)
      }
    } finally {
      setIsChecking(false)
    }
  }, [])

  // Исправление проблемы
  const handleFix = useCallback(async (issueType: string) => {
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
  }, [handleCheck])

  // Переключение раскрытия деталей
  const toggleIssueExpanded = useCallback((issueType: string) => {
    setExpandedIssues((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(issueType)) {
        newSet.delete(issueType)
      } else {
        newSet.add(issueType)
      }
      return newSet
    })
  }, [])

  // Подтвердить лицо
  const handleConfirmFace = useCallback(async (
    faceId: string, 
    actionType: "verify" | "elevate", 
    item?: any
  ) => {
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

    // Для остальных случаев (elevate)
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
  }, [confidenceThreshold])

  // Отклонить лицо
  const handleRejectFace = useCallback(async (
    faceId: string, 
    actionType: "unverify" | "unlink"
  ) => {
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
  }, [])

  // Закрытие диалога тегирования
  const handleTaggingDialogClose = useCallback(() => {
    setTaggingDialogOpen(false)
    setSelectedPhotoForTagging(null)
  }, [])

  // После сохранения тегирования - перезапуск проверки
  const handleTaggingSave = useCallback(() => {
    handleCheck()
  }, [handleCheck])

  // Управление диалогом дубликатов
  const handleDuplicateDialogClose = useCallback((open: boolean) => {
    setDuplicateDialogOpen(open)
    if (!open) {
      handleCheck()
    }
  }, [handleCheck])

  const openDuplicateDialog = useCallback(() => {
    setDuplicateDialogOpen(true)
  }, [])

  return {
    // Состояние
    isChecking,
    report,
    fixingIssue,
    expandedIssues,
    processingFaces,
    removedFaces,
    confidenceThreshold,
    taggingDialogOpen,
    selectedPhotoForTagging,
    duplicateDialogOpen,
    // Действия
    handleCheck,
    handleFix,
    toggleIssueExpanded,
    handleConfirmFace,
    handleRejectFace,
    handleTaggingDialogClose,
    handleTaggingSave,
    handleDuplicateDialogClose,
    openDuplicateDialog,
  }
}
