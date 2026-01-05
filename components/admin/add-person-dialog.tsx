"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
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
import { Plus, Loader2, Trash2, User, RefreshCw } from "lucide-react"
import { addPersonAction, updatePersonAvatarAction } from "@/app/admin/actions"
import { generateAvatarBlob, uploadAvatarBlob, type BoundingBox } from "@/lib/avatar-utils"

interface AddPersonDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onPersonCreated?: (personId: string, personName: string) => void
  // Data for avatar generation
  faceImageUrl?: string
  faceBbox?: BoundingBox
}

export function AddPersonDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onPersonCreated,
  faceImageUrl,
  faceBbox,
}: AddPersonDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generatingAvatar, setGeneratingAvatar] = useState(false)

  // Avatar preview state
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null)
  const [userDeletedAvatar, setUserDeletedAvatar] = useState(false)

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = controlledOnOpenChange || setInternalOpen

  const canGenerateAvatar = faceImageUrl && faceBbox

  // Generate avatar preview
  const generateAvatarPreview = useCallback(async () => {
    if (!faceImageUrl || !faceBbox) return

    setGeneratingAvatar(true)
    try {
      console.log("[AddPersonDialog] Generating avatar preview")
      const blob = await generateAvatarBlob(faceImageUrl, faceBbox)
      const previewUrl = URL.createObjectURL(blob)

      setAvatarBlob(blob)
      setAvatarPreviewUrl(previewUrl)
      console.log("[AddPersonDialog] Avatar preview generated")
    } catch (error) {
      console.error("[AddPersonDialog] Error generating avatar preview:", error)
    } finally {
      setGeneratingAvatar(false)
    }
  }, [faceImageUrl, faceBbox])

  // Generate avatar when dialog opens (but not if user deleted it)
  useEffect(() => {
    if (open && canGenerateAvatar && !avatarPreviewUrl && !generatingAvatar && !userDeletedAvatar) {
      generateAvatarPreview()
    }
  }, [open, canGenerateAvatar, avatarPreviewUrl, generatingAvatar, userDeletedAvatar, generateAvatarPreview])

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl)
      }
      setAvatarPreviewUrl(null)
      setAvatarBlob(null)
      setUserDeletedAvatar(false)
    }
  }, [open, avatarPreviewUrl])

  const handleDeleteAvatar = useCallback(() => {
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl)
    }
    setAvatarPreviewUrl(null)
    setAvatarBlob(null)
    setUserDeletedAvatar(true)
  }, [avatarPreviewUrl])

  const handleRegenerateAvatar = useCallback(() => {
    setUserDeletedAvatar(false)
    generateAvatarPreview()
  }, [generateAvatarPreview])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    setLoading(true)

    const data = {
      real_name: formData.get("real_name") as string,
      gmail: formData.get("gmail") as string | undefined,
      telegram_full_name: formData.get("telegram_full_name") as string | undefined,
      telegram_username: formData.get("telegram_username") as string | undefined,
      facebook_profile_url: formData.get("facebook_profile_url") as string | undefined,
      instagram_profile_url: formData.get("instagram_profile_url") as string | undefined,
      paddle_ranking: formData.get("paddle_ranking") ? Number(formData.get("paddle_ranking")) : undefined,
    }

    const result = await addPersonAction(data)

    if (result.success && result.data) {
      const personId = result.data.id
      const personName = result.data.real_name

      // Upload avatar if we have one
      if (avatarBlob) {
        try {
          console.log("[AddPersonDialog] Uploading avatar for", personName)
          const avatarUrl = await uploadAvatarBlob(avatarBlob, personId, personName)
          await updatePersonAvatarAction(personId, avatarUrl)
          console.log("[AddPersonDialog] Avatar uploaded:", avatarUrl)
        } catch (error) {
          console.error("[AddPersonDialog] Error uploading avatar:", error)
          // Don't fail - person is already created
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
          {/* First 3 fields with avatar on the right */}
          <div className="flex gap-4 items-start">
            <div className="flex-1 space-y-4 min-w-0">
              <div className="grid gap-2">
                <Label htmlFor="real_name">Реальное имя *</Label>
                <Input id="real_name" name="real_name" required />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="telegram_full_name">Имя в Telegram</Label>
                <Input id="telegram_full_name" name="telegram_full_name" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="telegram_username">Username в Telegram</Label>
                <Input id="telegram_username" name="telegram_username" placeholder="@username" />
              </div>
            </div>

            {/* Avatar section - 3:4 aspect ratio, 144x192px */}
            {canGenerateAvatar && (
              <div className="relative w-36 h-48 flex-shrink-0 mt-6">
                {generatingAvatar ? (
                  <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : avatarPreviewUrl ? (
                  <>
                    <Image
                      src={avatarPreviewUrl}
                      alt="Превью аватара"
                      fill
                      className="object-cover rounded-lg"
                      sizes="144px"
                    />
                    <button
                      type="button"
                      onClick={handleDeleteAvatar}
                      className="absolute -top-2 -right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-md shadow-lg transition-colors"
                      title="Удалить аватар"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </>
                ) : (
                  <div className="relative w-full h-full bg-muted rounded-lg flex items-center justify-center">
                    <User className="h-12 w-12 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={handleRegenerateAvatar}
                      className="absolute -top-2 -right-2 p-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-md transition-colors"
                      title="Создать аватар"
                    >
                      <RefreshCw className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
            )}
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
            <Input id="paddle_ranking" name="paddle_ranking" type="number" min="1" max="7" step="0.5" />
            <p className="text-xs text-muted-foreground">Значение от 1 до 7 с шагом 0.5</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={loading || generatingAvatar}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Сохранение...
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
