"use client"

/**
 * Face Training Manager Component
 *
 * Simplified: Only recognition parameters (no training)
 * @updated 2025-01-02
 */

import { Loader2 } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useFaceTraining } from "./hooks"
import { ErrorBanners, ConfigurationCard } from "./components"

export function FaceTrainingManager() {
  const {
    localConfig,
    setLocalConfig,
    loading,
    fastapiError,
    httpsRequired,
    saveConfig,
    resetConfig,
  } = useFaceTraining()

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Настройки распознавания</h2>
        <p className="text-sm text-muted-foreground">
          Параметры качества и порогов распознавания лиц
        </p>
      </div>

      {/* Предупреждения об ошибках */}
      <ErrorBanners httpsRequired={httpsRequired} fastapiError={fastapiError} />

      {/* Настройки */}
      <ConfigurationCard
        localConfig={localConfig}
        setLocalConfig={setLocalConfig}
        fastapiError={fastapiError}
        onSave={saveConfig}
        onReset={resetConfig}
      />

      {/* Автоматические аватары */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="space-y-0.5">
            <Label className="text-base">Автоматически присваивать аватар при создании игрока</Label>
            <p className="text-sm text-muted-foreground">
              При создании нового игрока аватар будет сгенерирован автоматически из фото с лицом
            </p>
          </div>
          <Switch
            checked={localConfig.auto_avatar_on_create === true}
            onCheckedChange={(checked) =>
              setLocalConfig({
                ...localConfig,
                auto_avatar_on_create: checked,
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
