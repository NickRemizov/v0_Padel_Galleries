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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { 
  Users, 
  Trash2, 
  Merge, 
  AlertTriangle, 
  Check, 
  Loader2,
  Camera,
  Mail,
  MessageCircle,
  Facebook,
  Instagram,
  ExternalLink
} from "lucide-react"
import { 
  findDuplicatePeopleAction, 
  deletePersonWithUnlinkAction, 
  mergePeopleAction,
  type DuplicateGroup,
  type DuplicatePerson
} from "@/app/admin/actions/people"
import { useToast } from "@/hooks/use-toast"

interface DuplicatePeopleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const FIELD_LABELS: Record<string, string> = {
  gmail: "Gmail",
  telegram_nickname: "Telegram ник",
  telegram_profile_url: "Telegram профиль",
  facebook_profile_url: "Facebook профиль",
  instagram_profile_url: "Instagram профиль",
}

const FIELD_ICONS: Record<string, React.ReactNode> = {
  gmail: <Mail className="h-3 w-3" />,
  telegram_nickname: <MessageCircle className="h-3 w-3" />,
  telegram_profile_url: <MessageCircle className="h-3 w-3" />,
  facebook_profile_url: <Facebook className="h-3 w-3" />,
  instagram_profile_url: <Instagram className="h-3 w-3" />,
}

export function DuplicatePeopleDialog({ open, onOpenChange }: DuplicatePeopleDialogProps) {
  const [loading, setLoading] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0)
  const [selectedKeepId, setSelectedKeepId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const { toast } = useToast()

  const currentGroup = duplicateGroups[currentGroupIndex]

  // Загрузка дубликатов
  const handleLoadDuplicates = async () => {
    setLoading(true)
    try {
      const result = await findDuplicatePeopleAction()
      if (result.success && result.data) {
        setDuplicateGroups(result.data)
        setCurrentGroupIndex(0)
        if (result.data.length > 0) {
          // По умолчанию выбираем игрока с наибольшим количеством фото
          const firstGroup = result.data[0]
          const keepPerson = firstGroup.people.reduce((prev, curr) => 
            curr.photo_count > prev.photo_count ? curr : prev
          )
          setSelectedKeepId(keepPerson.id)
        }
        if (result.data.length === 0) {
          toast({
            title: "Дубликатов не найдено",
            description: "Все игроки уникальны",
          })
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
  }

  // Удалить выбранного игрока
  const handleDelete = async (personId: string) => {
    if (!confirm("Удалить этого игрока? Все его фото будут отвязаны.")) return
    
    setProcessing(true)
    try {
      const result = await deletePersonWithUnlinkAction(personId)
      if (result.success) {
        toast({
          title: "Игрок удален",
          description: `Отвязано фото: ${result.data?.unlinkedPhotos || 0}`,
        })
        // Убираем игрока из текущей группы
        const updatedGroups = [...duplicateGroups]
        const currentPeople = updatedGroups[currentGroupIndex].people.filter(p => p.id !== personId)
        
        if (currentPeople.length < 2) {
          // Если осталось меньше 2 игроков - убираем группу
          updatedGroups.splice(currentGroupIndex, 1)
          setDuplicateGroups(updatedGroups)
          if (currentGroupIndex >= updatedGroups.length && updatedGroups.length > 0) {
            setCurrentGroupIndex(updatedGroups.length - 1)
          }
        } else {
          updatedGroups[currentGroupIndex].people = currentPeople
          setDuplicateGroups(updatedGroups)
        }
        
        // Обновляем выбранного
        if (selectedKeepId === personId && currentPeople.length > 0) {
          setSelectedKeepId(currentPeople[0].id)
        }
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
  }

  // Объединить всех дублей с выбранным игроком
  const handleMerge = async () => {
    if (!selectedKeepId || !currentGroup) return
    
    const mergeIds = currentGroup.people
      .filter(p => p.id !== selectedKeepId)
      .map(p => p.id)
    
    if (mergeIds.length === 0) return
    
    const keepPerson = currentGroup.people.find(p => p.id === selectedKeepId)
    if (!confirm(`Объединить ${mergeIds.length} игроков с "${keepPerson?.real_name}"?`)) return
    
    setProcessing(true)
    try {
      const result = await mergePeopleAction(selectedKeepId, mergeIds)
      if (result.success) {
        toast({
          title: "Игроки объединены",
          description: `Перенесено фото: ${result.data?.movedPhotos || 0}, объединено полей: ${result.data?.mergedFields?.length || 0}`,
        })
        // Убираем группу
        const updatedGroups = duplicateGroups.filter((_, i) => i !== currentGroupIndex)
        setDuplicateGroups(updatedGroups)
        if (currentGroupIndex >= updatedGroups.length && updatedGroups.length > 0) {
          setCurrentGroupIndex(updatedGroups.length - 1)
          const nextGroup = updatedGroups[updatedGroups.length - 1]
          if (nextGroup) {
            const keepPerson = nextGroup.people.reduce((prev, curr) => 
              curr.photo_count > prev.photo_count ? curr : prev
            )
            setSelectedKeepId(keepPerson.id)
          }
        } else if (updatedGroups.length > 0) {
          const nextGroup = updatedGroups[currentGroupIndex]
          if (nextGroup) {
            const keepPerson = nextGroup.people.reduce((prev, curr) => 
              curr.photo_count > prev.photo_count ? curr : prev
            )
            setSelectedKeepId(keepPerson.id)
          }
        }
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
  }

  // Следующая группа
  const handleNextGroup = () => {
    if (currentGroupIndex < duplicateGroups.length - 1) {
      const nextIndex = currentGroupIndex + 1
      setCurrentGroupIndex(nextIndex)
      const nextGroup = duplicateGroups[nextIndex]
      const keepPerson = nextGroup.people.reduce((prev, curr) => 
        curr.photo_count > prev.photo_count ? curr : prev
      )
      setSelectedKeepId(keepPerson.id)
    }
  }

  // Предыдущая группа
  const handlePrevGroup = () => {
    if (currentGroupIndex > 0) {
      const prevIndex = currentGroupIndex - 1
      setCurrentGroupIndex(prevIndex)
      const prevGroup = duplicateGroups[prevIndex]
      const keepPerson = prevGroup.people.reduce((prev, curr) => 
        curr.photo_count > prev.photo_count ? curr : prev
      )
      setSelectedKeepId(keepPerson.id)
    }
  }

  const renderPersonCard = (person: DuplicatePerson, isSelected: boolean) => (
    <Card 
      key={person.id} 
      className={`cursor-pointer transition-all ${
        isSelected ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"
      }`}
      onClick={() => setSelectedKeepId(person.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={person.avatar_url || undefined} />
            <AvatarFallback>{person.real_name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{person.real_name}</span>
              {isSelected && (
                <Badge variant="default" className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  Оставить
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Camera className="h-3 w-3" />
              <span>{person.photo_count} фото</span>
            </div>
            
            {/* Контактные данные */}
            <div className="mt-2 space-y-1 text-xs">
              {person.gmail && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{person.gmail}</span>
                </div>
              )}
              {person.telegram_nickname && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MessageCircle className="h-3 w-3" />
                  <span className="truncate">@{person.telegram_nickname}</span>
                </div>
              )}
              {person.telegram_profile_url && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  <a 
                    href={person.telegram_profile_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="truncate hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    Telegram
                  </a>
                </div>
              )}
              {person.facebook_profile_url && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Facebook className="h-3 w-3" />
                  <a 
                    href={person.facebook_profile_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="truncate hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    Facebook
                  </a>
                </div>
              )}
              {person.instagram_profile_url && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Instagram className="h-3 w-3" />
                  <a 
                    href={person.instagram_profile_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="truncate hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    Instagram
                  </a>
                </div>
              )}
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(person.id)
            }}
            disabled={processing}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )

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
            <p className="text-muted-foreground text-center">
              Нажмите кнопку для поиска дубликатов
            </p>
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
            {/* Навигация по группам */}
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
                {/* Информация о совпадении */}
                <Card className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Совпадение по полю: {FIELD_LABELS[currentGroup.matchField] || currentGroup.matchField}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-amber-600 dark:text-amber-500 flex items-center gap-1">
                      {FIELD_ICONS[currentGroup.matchField]}
                      <span className="truncate">{currentGroup.matchValue}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Список игроков */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Выберите игрока, которого оставить (остальные будут объединены с ним):
                  </p>
                  {currentGroup.people.map(person => 
                    renderPersonCard(person, person.id === selectedKeepId)
                  )}
                </div>

                <Separator />

                {/* Действия */}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={processing}
                  >
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
