"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Loader2, Save, Check } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import Image from "next/image"

interface Person {
  id: string
  real_name: string | null
  avatar_url: string | null
  gmail: string | null
  facebook_profile_url: string | null
  instagram_profile_url: string | null
  paddle_ranking: number | null
  show_in_players_gallery: boolean
  create_personal_gallery: boolean
  show_name_on_photos: boolean
  show_telegram_username: boolean
  show_social_links: boolean
}

interface SettingsFormProps {
  person: Person
  telegramName: string
  telegramUsername?: string
}

export function SettingsForm({ person, telegramName, telegramUsername }: SettingsFormProps) {
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [realName, setRealName] = useState(person.real_name || "")
  const [gmail, setGmail] = useState(person.gmail || "")
  const [facebook, setFacebook] = useState(person.facebook_profile_url || "")
  const [instagram, setInstagram] = useState(person.instagram_profile_url || "")
  const [paddleRanking, setPaddleRanking] = useState<number | null>(person.paddle_ranking)

  // Toggles
  const [showInPlayersGallery, setShowInPlayersGallery] = useState(person.show_in_players_gallery ?? true)
  const [createPersonalGallery, setCreatePersonalGallery] = useState(person.create_personal_gallery ?? false)
  const [showNameOnPhotos, setShowNameOnPhotos] = useState(person.show_name_on_photos ?? true)
  const [showTelegramUsername, setShowTelegramUsername] = useState(person.show_telegram_username ?? true)
  const [showSocialLinks, setShowSocialLinks] = useState(person.show_social_links ?? true)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          real_name: realName || null,
          gmail: gmail || null,
          facebook_profile_url: facebook || null,
          instagram_profile_url: instagram || null,
          paddle_ranking: paddleRanking,
          show_in_players_gallery: showInPlayersGallery,
          create_personal_gallery: createPersonalGallery,
          show_name_on_photos: showNameOnPhotos,
          show_telegram_username: showTelegramUsername,
          show_social_links: showSocialLinks,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to save")
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Telegram Info (read-only) */}
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Telegram</h3>
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-4">
            <div>
              <Label className="text-muted-foreground">Имя в Telegram</Label>
              <p className="font-medium">{telegramName}</p>
            </div>
            {telegramUsername && (
              <div>
                <Label className="text-muted-foreground">Username</Label>
                <p className="font-medium">@{telegramUsername}</p>
              </div>
            )}
          </div>
          {person.avatar_url && (
            <div className="relative w-16 h-16 flex-shrink-0">
              <Image
                src={person.avatar_url}
                alt="Аватар"
                fill
                className="object-cover rounded-full"
                sizes="64px"
              />
            </div>
          )}
        </div>
      </div>

      {/* Profile Info */}
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Профиль</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="real_name">Имя на сайте</Label>
            <Input
              id="real_name"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="Ваше имя"
            />
          </div>

          <div>
            <Label htmlFor="paddle_ranking">Уровень в падел</Label>
            <div className="flex items-center gap-4 mt-2">
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
            <p className="text-xs text-muted-foreground mt-1">От 1 до 7</p>
          </div>
        </div>
      </div>

      {/* Social Links */}
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Социальные сети</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Эти данные позволят связать ваши аккаунты в разных сетях
        </p>
        <div className="space-y-4">
          <div>
            <Label htmlFor="gmail">Gmail</Label>
            <Input
              id="gmail"
              type="email"
              value={gmail}
              onChange={(e) => setGmail(e.target.value)}
              placeholder="your@gmail.com"
            />
          </div>

          <div>
            <Label htmlFor="facebook">Facebook</Label>
            <Input
              id="facebook"
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              placeholder="https://facebook.com/username"
            />
          </div>

          <div>
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="https://instagram.com/username"
            />
          </div>
        </div>
      </div>

      {/* Privacy Settings */}
      <div className="bg-card rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Приватность</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Настройки влияют друг на друга: отключение нижнего переключателя автоматически отключает верхние
        </p>
        <div className="space-y-6">
          {/* Level 3: show_in_players_gallery (depends on create_personal_gallery) */}
          <div className={`flex items-center justify-between ${!createPersonalGallery ? "opacity-50" : ""}`}>
            <div>
              <Label htmlFor="show_in_players_gallery">Показывать в галерее игроков</Label>
              <p className="text-sm text-muted-foreground">
                Ваш профиль будет виден на странице /players
              </p>
            </div>
            <Switch
              id="show_in_players_gallery"
              checked={showInPlayersGallery}
              onCheckedChange={setShowInPlayersGallery}
              disabled={!createPersonalGallery}
            />
          </div>

          {/* Level 2: create_personal_gallery (depends on show_name_on_photos) */}
          <div className={`flex items-center justify-between ${!showNameOnPhotos ? "opacity-50" : ""}`}>
            <div>
              <Label htmlFor="create_personal_gallery">Создавать галерею моих фото</Label>
              <p className="text-sm text-muted-foreground">
                Имя на фото будет ссылкой на все ваши фотографии
              </p>
            </div>
            <Switch
              id="create_personal_gallery"
              checked={createPersonalGallery}
              onCheckedChange={(checked) => {
                setCreatePersonalGallery(checked)
                // Cascade: if turning off, also turn off dependent
                if (!checked) {
                  setShowInPlayersGallery(false)
                }
              }}
              disabled={!showNameOnPhotos}
            />
          </div>

          {/* Level 1: show_name_on_photos (master) */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="show_name_on_photos">Подписывать меня на фото</Label>
              <p className="text-sm text-muted-foreground">
                Ваше имя будет отображаться на фотографиях
              </p>
            </div>
            <Switch
              id="show_name_on_photos"
              checked={showNameOnPhotos}
              onCheckedChange={(checked) => {
                setShowNameOnPhotos(checked)
                // Cascade: if turning off, also turn off all dependents
                if (!checked) {
                  setCreatePersonalGallery(false)
                  setShowInPlayersGallery(false)
                }
              }}
            />
          </div>

          <hr className="my-4" />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="show_telegram_username">Показывать мой Telegram</Label>
              <p className="text-sm text-muted-foreground">
                Ваш @username будет виден в профиле
              </p>
            </div>
            <Switch
              id="show_telegram_username"
              checked={showTelegramUsername}
              onCheckedChange={setShowTelegramUsername}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="show_social_links">Показывать мои соцсети</Label>
              <p className="text-sm text-muted-foreground">
                Ссылки на Facebook и Instagram будут видны
              </p>
            </div>
            <Switch
              id="show_social_links"
              checked={showSocialLinks}
              onCheckedChange={setShowSocialLinks}
            />
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Submit button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Сохранение...
            </>
          ) : saved ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Сохранено
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Сохранить
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
