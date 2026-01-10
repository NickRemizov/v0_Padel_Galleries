"use client"

import { useState, useEffect, useCallback } from "react"
import type { Config } from "../types"
import { DEFAULT_CONFIG } from "../constants"

/**
 * Hook for managing face recognition configuration.
 * Simplified: Only config management, training functionality removed (dead code).
 */
export function useFaceTraining() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [fastapiError, setFastapiError] = useState(false)
  const [localConfig, setLocalConfig] = useState<Config>(DEFAULT_CONFIG)

  // Load config from API
  const loadData = useCallback(async () => {
    setLoading(true)
    setFastapiError(false)
    try {
      const configRes = await fetch("/api/admin/training/config")

      if (configRes.ok) {
        const configResult = await configRes.json()
        if (configResult.success && configResult.data) {
          const configData = configResult.data
          const validConfig = {
            ...DEFAULT_CONFIG,
            ...configData,
            confidence_thresholds: {
              ...DEFAULT_CONFIG.confidence_thresholds,
              ...(configData.confidence_thresholds || {}),
            },
            quality_filters: {
              ...DEFAULT_CONFIG.quality_filters,
              ...(configData.quality_filters || {}),
            },
          }
          setFastapiError(false)
          setConfig(validConfig)
          setLocalConfig(validConfig)
        } else {
          setFastapiError(true)
          setConfig(DEFAULT_CONFIG)
          setLocalConfig(DEFAULT_CONFIG)
        }
      } else {
        setFastapiError(true)
        setConfig(DEFAULT_CONFIG)
        setLocalConfig(DEFAULT_CONFIG)
      }
    } catch (error) {
      console.error("[Galeries] Error loading config:", error)
      setFastapiError(true)
      setConfig(DEFAULT_CONFIG)
      setLocalConfig(DEFAULT_CONFIG)
    } finally {
      setLoading(false)
    }
  }, [])

  // Save config to API
  const saveConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/training/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localConfig),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to save config")
      }

      setConfig(localConfig)
      setFastapiError(false)
      alert("Настройки сохранены успешно!")
    } catch (error) {
      console.error("[Galeries] Error saving config:", error)
      const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка"

      if (errorMessage.includes("503") || errorMessage.includes("Service Unavailable")) {
        alert("Error 503: FastAPI сервер недоступен.")
      } else if (errorMessage.includes("connection_failed")) {
        alert("Ошибка подключения: Не удалось подключиться к FastAPI серверу.")
      } else {
        alert(`Ошибка при сохранении настроек: ${errorMessage}`)
      }
    }
  }, [localConfig])

  // Reset config to last saved state
  const resetConfig = useCallback(() => {
    setLocalConfig(config)
  }, [config])

  // Load config on mount
  useEffect(() => {
    loadData()
  }, [loadData])

  return {
    // State
    config,
    localConfig,
    setLocalConfig,
    loading,
    fastapiError,
    // Actions
    loadData,
    saveConfig,
    resetConfig,
  }
}
