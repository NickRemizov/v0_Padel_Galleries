"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updatePersonAction, deletePersonAvatarAction, updatePersonAvatarAction, getBestFaceForAvatarAction } from "@/app/admin/actions"
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog"
import { Slider } from "@/components/ui/slider"
import { Trash2, User, Plus } from "lucide-react"
import { generateAvatarBlob, uploadAvatarBlob, type BoundingBox } from "@/lib/avatar-utils"
import type { Person } from "@/lib/types"

type PersonWithStats = Person & {
  verified_photos_count?: number
  high_confidence_photos_count?: number
  descriptor_count?: number
}

interface EditPersonDialogProps {
  person: PersonWithStats
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (updatedPerson: Partial<Person>) => void
}

export function EditPersonDialog({ person, open, onOpenChange, onSuccess }: EditPersonDialogProps) {
  const [loading, setLoading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(person.avatar_url)
  const [deleteAvatarDialog, setDeleteAvatarDialog] = useState(false)
  const [createAvatarDialog, setCreateAvatarDialog] = useState(false)
  const [creatingAvatar, setCreatingAvatar] = useState(false)
  const [paddleRanking, setPaddleRanking] = useState<number | null>(person.paddle_ranking ?? null)

  const photoCount = (person.verified_photos_count ?? 0) + (person.high_confidence_photos_count ?? 0)
  const hasPhotos = photoCount > 0

  // Sync state when person changes
  useEffect(() => {
    setAvatarUrl(person.avatar_url)
    setPaddleRanking(person.paddle_ranking ?? null)
  }, [person.avatar_url, person.paddle_ranking])

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    const data: Record<string, any> = {}
    formData.forEach((value, key) => {
      if (key === "tournament_results") {
        try {
          data[key] = JSON.parse(value as string)
        } catch {
          data[key] = []
        }
      } else {
        data[key] = value || null
      }
    })
    // Add paddle_ranking from state (controlled by slider)
    data.paddle_ranking = paddleRanking

    const result = await updatePersonAction(person.id, data)
    setLoading(false)

    if (result.success) {
      onSuccess?.({ id: person.id, ...data })
      onOpenChange(false)
    }
  }

  async function handleDeleteAvatar() {
    const result = await deletePersonAvatarAction(person.id)

    if (result.success) {
      setAvatarUrl(null)
      setDeleteAvatarDialog(false)
      // Don't call onSuccess here - it would close the parent dialog
    }
  }

  async function handleCreateAvatar() {
    setCreatingAvatar(true)
    try {
      // Fetch best face for this person (closest to centroid)
      const result = await getBestFaceForAvatarAction(person.id)

      if (!result.success || !result.data) {
        alert("Не удалось найти подходящее лицо для аватара")
        return
      }

      const { image_url, bbox } = result.data
      const bboxData: BoundingBox = {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
      }

      // Generate and upload avatar
      const avatarBlob = await generateAvatarBlob(image_url, bboxData)
      const newAvatarUrl = await uploadAvatarBlob(avatarBlob, person.id, person.real_name)

      // Update person's avatar in DB
      const updateResult = await updatePersonAvatarAction(person.id, newAvatarUrl)

      if (updateResult.success) {
        setAvatarUrl(newAvatarUrl)
        setCreateAvatarDialog(false)
      }
    } catch (error) {
      console.error("Error creating avatar:", error)
      alert("Ошибка при создании аватара")
    } finally {
      setCreatingAvatar(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Редактировать человека</DialogTitle>
            <DialogDescription>Измените информацию о человеке</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* First 3 fields with avatar on the right */}
            <div className="flex gap-4 items-start">
              <div className="flex-1 space-y-4 min-w-0">
                <div className="grid gap-2">
                  <Label htmlFor="real_name">Реальное имя *</Label>
                  <Input id="real_name" name="real_name" defaultValue={person.real_name} required />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="telegram_full_name">Имя в Telegram</Label>
                  <Input id="telegram_full_name" name="telegram_full_name" defaultValue={person.telegram_full_name || ""} />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="telegram_username">Username в Telegram</Label>
                  <Input
                    id="telegram_username"
                    name="telegram_username"
                    defaultValue={person.telegram_username || ""}
                    placeholder="@username"
                  />
                </div>
              </div>

              {/* Avatar section - 3:4 aspect ratio, 144x192px, aligned with first input */}
              <div className="relative w-36 h-48 flex-shrink-0 mt-6">
                {avatarUrl ? (
                  <>
                    <Image
                      src={avatarUrl}
                      alt={person.real_name}
                      fill
                      className="object-cover rounded-lg"
                      sizes="144px"
                    />
                    <button
                      type="button"
                      onClick={() => setDeleteAvatarDialog(true)}
                      className="absolute -top-2 -right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-md shadow-lg transition-colors"
                      title="Удалить аватар"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </>
                ) : (
                  <div className="relative w-full h-full bg-muted rounded-lg flex items-center justify-center">
                    <User className="h-12 w-12 text-muted-foreground" />
                    {hasPhotos && (
                      <button
                        type="button"
                        onClick={() => setCreateAvatarDialog(true)}
                        className="absolute -top-2 -right-2 p-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-md transition-colors"
                        title="Создать аватар автоматически"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="gmail">Gmail (для авторизации)</Label>
              <Input
                id="gmail"
                name="gmail"
                type="email"
                defaultValue={person.gmail || ""}
                placeholder="user@gmail.com"
                pattern="[a-zA-Z0-9._%+-]+@gmail\.com$"
                title="Введите адрес Gmail (example@gmail.com)"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="facebook_profile_url">Ссылка на профиль Facebook</Label>
              <Input
                id="facebook_profile_url"
                name="facebook_profile_url"
                type="url"
                defaultValue={person.facebook_profile_url || ""}
                placeholder="https://facebook.com/username"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="instagram_profile_url">Ссылка на профиль Instagram</Label>
              <Input
                id="instagram_profile_url"
                name="instagram_profile_url"
                type="url"
                defaultValue={person.instagram_profile_url || ""}
                placeholder="https://instagram.com/username"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="paddle_ranking">Уровень в падел</Label>
              <div className="flex items-center gap-4">
                <Slider
                  id="paddle_ranking"
                  min={1}
                  max={7}
                  step={0.5}
                  value={paddleRanking !== null ? [paddleRanking] : [1]}
                  onValueChange={(values) => setPaddleRanking(values[0])}
                  className="flex-1"
                />
                <span className="w-12 text-center font-medium tabular-nums">
                  {paddleRanking !== null ? paddleRanking : "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">От 1 до 7</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tournament_results">Результаты турниров (JSON)</Label>
              <Textarea
                id="tournament_results"
                name="tournament_results"
                defaultValue={JSON.stringify(person.tournament_results, null, 2)}
                placeholder='[{"tournament": "Название турнира", "place": 1, "date": "2024-01-01"}]'
                rows={6}
              />
              <p className="text-xs text-muted-foreground">Формат: массив объектов с полями tournament, place, date</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Сохранение..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <DeleteConfirmDialog
        open={deleteAvatarDialog}
        onOpenChange={setDeleteAvatarDialog}
        onConfirm={handleDeleteAvatar}
        title="Удалить аватар"
        description="Вы уверены, что хотите удалить аватар? Это действие невозможно отменить."
      />

      <DeleteConfirmDialog
        open={createAvatarDialog}
        onOpenChange={setCreateAvatarDialog}
        onConfirm={handleCreateAvatar}
        title="Создать аватар"
        description={`Создать для игрока ${person.real_name} аватар автоматически из наиболее подходящего фото?`}
        confirmText={creatingAvatar ? "Создание..." : "Создать"}
        isDestructive={false}
      />
    </Dialog>
  )
}
