"use client"

/**
 * Face Training Manager Component
 *
 * Simplified: Only recognition parameters (no training)
 * @updated 2025-01-02
 */

import { Loader2 } from "lucide-react"

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
    </div>
  )
}
