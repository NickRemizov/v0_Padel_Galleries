"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Users, Merge, Loader2 } from "lucide-react"
import {
  findDuplicatePeopleAction,
  deletePersonWithUnlinkAction,
  mergePeopleAction,
  type DuplicateGroup,
} from "@/app/admin/actions/people"
import { useToast } from "@/hooks/use-toast"
import { PersonCard } from "./PersonCard"
import { MatchInfoCard } from "./MatchInfoCard"

interface DuplicatePeopleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DuplicatePeopleDialog({ open, onOpenChange }: DuplicatePeopleDialogProps) {
  const [loading, setLoading] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0)
  const [selectedKeepId, setSelectedKeepId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const { toast } = useToast()

  const currentGroup = duplicateGroups[currentGroupIndex]

  const selectBestPerson = (group: DuplicateGroup) => {
    const keepPerson = group.people.reduce((prev, curr) =>
      curr.photo_count > prev.photo_count ? curr : prev
    )
    setSelectedKeepId(keepPerson.id)
  }

  const handleLoadDuplicates = async () => {
    setLoading(true)
    try {
      const result = await findDuplicatePeopleAction()
      if (result.success && result.data) {
        setDuplicateGroups(result.data)
        setCurrentGroupIndex(0)
        if (result.data.length > 0) {
          selectBestPerson(result.data[0])
        }
        if (result.data.length === 0) {
          toast({ title: "Дубликатов не найдено", description: "Все игроки уникальны" })
        }
      } else {
        toast({ title: "Ошибка", description: result.error || "Не удалось загрузить дубликаты", variant: "destructive" })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (personId: string) => {
    if (!confirm("Удалить этого игрока? Все его фото будут отвязаны.")) return

    setProcessing(true)
    try {
      const result = await deletePersonWithUnlinkAction(personId)
      if (result.success) {
        toast({ title: "Игрок удален", description: `Отвязано фото: ${result.data?.unlinkedPhotos || 0}` })

        const updatedGroups = [...duplicateGroups]
        const currentPeople = updatedGroups[currentGroupIndex].people.filter((p) => p.id !== personId)

        if (currentPeople.length < 2) {
          updatedGroups.splice(currentGroupIndex, 1)
          setDuplicateGroups(updatedGroups)
          if (currentGroupIndex >= updatedGroups.length && updatedGroups.length > 0) {
            setCurrentGroupIndex(updatedGroups.length - 1)
          }
        } else {
          updatedGroups[currentGroupIndex].people = currentPeople
          setDuplicateGroups(updatedGroups)
        }

        if (selectedKeepId === personId && currentPeople.length > 0) {
          setSelectedKeepId(currentPeople[0].id)
        }
      } else {
        toast({ title: "Ошибка", description: result.error || "Не удалось удалить игрока", variant: "destructive" })
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleMerge = async () => {
    if (!selectedKeepId || !currentGroup) return

    const mergeIds = currentGroup.people.filter((p) => p.id !== selectedKeepId).map((p) => p.id)
    if (mergeIds.length === 0) return

    const keepPerson = currentGroup.people.find((p) => p.id === selectedKeepId)
    if (!confirm(`Объединить ${mergeIds.length} игроков с "${keepPerson?.real_name}"?`)) return

    setProcessing(true)
    try {
      const result = await mergePeopleAction(selectedKeepId, mergeIds)
      if (result.success) {
        toast({
          title: "Игроки объединены",
          description: `Перенесено фото: ${result.data?.movedPhotos || 0}, объединено полей: ${result.data?.mergedFields?.length || 0}`,
        })

        const updatedGroups = duplicateGroups.filter((_, i) => i !== currentGroupIndex)
        setDuplicateGroups(updatedGroups)

        if (updatedGroups.length > 0) {
          const nextIndex = Math.min(currentGroupIndex, updatedGroups.length - 1)
          setCurrentGroupIndex(nextIndex)
          selectBestPerson(updatedGroups[nextIndex])
        }
      } else {
        toast({ title: "Ошибка", description: result.error || "Не удалось объединить игроков", variant: "destructive" })
      }
    } finally {
      setProcessing(false)
    }
  }

  const handleNextGroup = () => {
    if (currentGroupIndex < duplicateGroups.length - 1) {
      const nextIndex = currentGroupIndex + 1
      setCurrentGroupIndex(nextIndex)
      selectBestPerson(duplicateGroups[nextIndex])
    }
  }

  const handlePrevGroup = () => {
    if (currentGroupIndex > 0) {
      const prevIndex = currentGroupIndex - 1
      setCurrentGroupIndex(prevIndex)
      selectBestPerson(duplicateGroups[prevIndex])
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Поиск дубликатов игроков
          </DialogTitle>
          <DialogDescription>
            Поиск игроков с совпадающими контактными данными (Gmail, Telegram, Facebook, Instagram)
          </DialogDescription>
        </DialogHeader>

        {duplicateGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Users className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-center">Нажмите кнопку для поиска дубликатов</p>
            <Button onClick={handleLoadDuplicates} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Поиск...
                </>
              ) : (
                <>
                  <Users className="mr-2 h-4 w-4" />
                  Найти дубликаты
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevGroup}
                disabled={currentGroupIndex === 0 || processing}
              >
                ← Назад
              </Button>
              <span className="text-sm text-muted-foreground">
                Группа {currentGroupIndex + 1} из {duplicateGroups.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextGroup}
                disabled={currentGroupIndex >= duplicateGroups.length - 1 || processing}
              >
                Вперед →
              </Button>
            </div>

            {currentGroup && (
              <>
                <MatchInfoCard matchField={currentGroup.matchField} matchValue={currentGroup.matchValue} />

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Выберите игрока, которого оставить (остальные будут объединены с ним):
                  </p>
                  {currentGroup.people.map((person) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      isSelected={person.id === selectedKeepId}
                      processing={processing}
                      onSelect={setSelectedKeepId}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>

                <Separator />

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
                    Закрыть
                  </Button>
                  <Button
                    onClick={handleMerge}
                    disabled={!selectedKeepId || processing || currentGroup.people.length < 2}
                  >
                    {processing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Объединение...
                      </>
                    ) : (
                      <>
                        <Merge className="mr-2 h-4 w-4" />
                        Объединить {currentGroup.people.length - 1} дублей
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
