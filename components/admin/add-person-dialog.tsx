"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Loader2 } from "lucide-react"
import { addPersonAction, updatePersonAvatarAction } from "@/app/admin/actions"
import { generateAvatarBlob, uploadAvatarBlob, type BoundingBox } from "@/lib/avatar-utils"

interface AddPersonDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onPersonCreated?: (personId: string, personName: string) => void
  // v1.1.0: Data for auto-avatar generation
  faceImageUrl?: string
  faceBbox?: BoundingBox
  autoAvatarEnabled?: boolean
}

export function AddPersonDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onPersonCreated,
  faceImageUrl,
  faceBbox,
  autoAvatarEnabled = true,
}: AddPersonDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null)

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = controlledOnOpenChange || setInternalOpen

  // Reset avatar status when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setAvatarStatus(null)
    }
  }, [open])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    setLoading(true)
    setAvatarStatus(null)

    const data = {
      real_name: formData.get("real_name") as string,
      gmail: formData.get("gmail") as string | undefined,
      telegram_name: formData.get("telegram_name") as string | undefined,
      telegram_nickname: formData.get("telegram_nickname") as string | undefined,
      facebook_profile_url: formData.get("facebook_profile_url") as string | undefined,
      instagram_profile_url: formData.get("instagram_profile_url") as string | undefined,
      paddle_ranking: formData.get("paddle_ranking") ? Number(formData.get("paddle_ranking")) : undefined,
    }

    const result = await addPersonAction(data)

    if (result.success && result.data) {
      const personId = result.data.id
      const personName = result.data.real_name

      // v1.1.0: Auto-generate avatar if enabled and face data provided
      if (autoAvatarEnabled && faceImageUrl && faceBbox) {
        setAvatarStatus("Генерация аватара...")
        try {
          console.log("[AddPersonDialog] Generating avatar for", personName)
          console.log("[AddPersonDialog] Image URL:", faceImageUrl)
          console.log("[AddPersonDialog] Bbox:", faceBbox)

          const avatarBlob = await generateAvatarBlob(faceImageUrl, faceBbox)
          setAvatarStatus("Загрузка аватара...")
          
          const avatarUrl = await uploadAvatarBlob(avatarBlob, personId)
          console.log("[AddPersonDialog] Avatar uploaded:", avatarUrl)
          
          await updatePersonAvatarAction(personId, avatarUrl)
          console.log("[AddPersonDialog] Avatar assigned to person")
          
          setAvatarStatus("Аватар создан!")
        } catch (error) {
          console.error("[AddPersonDialog] Error generating avatar:", error)
          setAvatarStatus("Ошибка создания аватара")
          // Don't fail the whole operation - person is already created
        }
      }

      setLoading(false)
      setOpen(false)
      onPersonCreated?.(personId, personName)
    } else {
      setLoading(false)
    }
  }

  const content = (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Добавить человека</DialogTitle>
          <DialogDescription>Заполните информацию о человеке</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="real_name">Реальное имя *</Label>
            <Input id="real_name" name="real_name" required />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="telegram_name">Имя в Telegram</Label>
            <Input id="telegram_name" name="telegram_name" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="telegram_nickname">Ник в Telegram</Label>
            <Input id="telegram_nickname" name="telegram_nickname" placeholder="@username" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="gmail">Gmail (для авторизации)</Label>
            <Input
              id="gmail"
              name="gmail"
              type="email"
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
              placeholder="https://facebook.com/username"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="instagram_profile_url">Ссылка на профиль Instagram</Label>
            <Input
              id="instagram_profile_url"
              name="instagram_profile_url"
              type="url"
              placeholder="https://instagram.com/username"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="paddle_ranking">Уровень в падел</Label>
            <Input id="paddle_ranking" name="paddle_ranking" type="number" min="0" max="10" step="0.25" />
            <p className="text-xs text-muted-foreground">Значение от 0 до 10 с шагом 0.25</p>
          </div>

          {/* Show avatar generation status */}
          {autoAvatarEnabled && faceImageUrl && faceBbox && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-sm text-muted-foreground">
                Аватар будет сгенерирован автоматически из текущего фото
              </p>
              {avatarStatus && (
                <p className="mt-1 text-sm font-medium">{avatarStatus}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {avatarStatus || "Добавление..."}
              </>
            ) : (
              "Добавить"
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )

  if (controlledOpen !== undefined) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {content}
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Добавить человека
        </Button>
      </DialogTrigger>
      {content}
    </Dialog>
  )
}
