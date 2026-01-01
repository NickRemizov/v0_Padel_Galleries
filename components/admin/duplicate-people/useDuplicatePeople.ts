"use client"

import { useState, useCallback } from "react"
import {
  findDuplicatePeopleAction,
  deletePersonWithUnlinkAction,
  mergePeopleAction,
} from "@/app/admin/actions/people"
import { useToast } from "@/hooks/use-toast"
import type { DuplicateGroup } from "./types"

export function useDuplicatePeople() {
  const [loading, setLoading] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0)
  const [selectedKeepId, setSelectedKeepId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const { toast } = useToast()

  const currentGroup = duplicateGroups[currentGroupIndex]

  const selectDefaultKeep = useCallback((group: DuplicateGroup) => {
    const keepPerson = group.people.reduce((prev, curr) =>
      curr.photo_count > prev.photo_count ? curr : prev
    )
    setSelectedKeepId(keepPerson.id)
  }, [])

  const handleLoadDuplicates = useCallback(async () => {
    setLoading(true)
    try {
      const result = await findDuplicatePeopleAction()
      if (result.success && result.data) {
        setDuplicateGroups(result.data)
        setCurrentGroupIndex(0)
        if (result.data.length > 0) {
          selectDefaultKeep(result.data[0])
        }
        if (result.data.length === 0) {
          toast({ title: "Дубликатов не найдено", description: "Все игроки уникальны" })
        }
      } else {
        toast({
          title: "Ошибка",
          description: result.error || "Не удалось загрузить дубликаты",
          variant: "destructive",
        })
      }
    } finally {
      setLoading(false)
    }
  }, [toast, selectDefaultKeep])

  const handleDelete = useCallback(async (personId: string) => {
    if (!confirm("Удалить этого игрока? Все его фото будут отвязаны.")) return

    setProcessing(true)
    try {
      const result = await deletePersonWithUnlinkAction(personId)
      if (result.success) {
        toast({
          title: "Игрок удален",
          description: `Отвязано фото: ${result.data?.unlinkedPhotos || 0}`,
        })

        setDuplicateGroups(prev => {
          const updated = [...prev]
          const currentPeople = updated[currentGroupIndex].people.filter(
            (p) => p.id !== personId
          )

          if (currentPeople.length < 2) {
            updated.splice(currentGroupIndex, 1)
            if (currentGroupIndex >= updated.length && updated.length > 0) {
              setCurrentGroupIndex(updated.length - 1)
            }
          } else {
            updated[currentGroupIndex].people = currentPeople
          }

          if (selectedKeepId === personId && currentPeople.length > 0) {
            setSelectedKeepId(currentPeople[0].id)
          }

          return updated
        })
      } else {
        toast({
          title: "Ошибка",
          description: result.error || "Не удалось удалить игрока",
          variant: "destructive",
        })
      }
    } finally {
      setProcessing(false)
    }
  }, [currentGroupIndex, selectedKeepId, toast])

  const handleMerge = useCallback(async () => {
    if (!selectedKeepId || !currentGroup) return

    const mergeIds = currentGroup.people
      .filter((p) => p.id !== selectedKeepId)
      .map((p) => p.id)

    if (mergeIds.length === 0) return

    const keepPerson = currentGroup.people.find((p) => p.id === selectedKeepId)
    if (!confirm(`Объединить ${mergeIds.length} игроков с "${keepPerson?.real_name}"?`))
      return

    setProcessing(true)
    try {
      const result = await mergePeopleAction(selectedKeepId, mergeIds)
      if (result.success) {
        toast({
          title: "Игроки объединены",
          description: `Перенесено фото: ${result.data?.movedPhotos || 0}, объединено полей: ${result.data?.mergedFields?.length || 0}`,
        })

        setDuplicateGroups(prev => {
          const updated = prev.filter((_, i) => i !== currentGroupIndex)
          
          if (updated.length > 0) {
            const nextIndex = Math.min(currentGroupIndex, updated.length - 1)
            setCurrentGroupIndex(nextIndex)
            selectDefaultKeep(updated[nextIndex])
          }
          
          return updated
        })
      } else {
        toast({
          title: "Ошибка",
          description: result.error || "Не удалось объединить игроков",
          variant: "destructive",
        })
      }
    } finally {
      setProcessing(false)
    }
  }, [selectedKeepId, currentGroup, currentGroupIndex, toast, selectDefaultKeep])

  const handleNextGroup = useCallback(() => {
    if (currentGroupIndex < duplicateGroups.length - 1) {
      const nextIndex = currentGroupIndex + 1
      setCurrentGroupIndex(nextIndex)
      selectDefaultKeep(duplicateGroups[nextIndex])
    }
  }, [currentGroupIndex, duplicateGroups, selectDefaultKeep])

  const handlePrevGroup = useCallback(() => {
    if (currentGroupIndex > 0) {
      const prevIndex = currentGroupIndex - 1
      setCurrentGroupIndex(prevIndex)
      selectDefaultKeep(duplicateGroups[prevIndex])
    }
  }, [currentGroupIndex, duplicateGroups, selectDefaultKeep])

  return {
    loading,
    duplicateGroups,
    currentGroupIndex,
    currentGroup,
    selectedKeepId,
    processing,
    setSelectedKeepId,
    handleLoadDuplicates,
    handleDelete,
    handleMerge,
    handleNextGroup,
    handlePrevGroup,
  }
}
