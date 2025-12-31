"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { Statistics } from "./types"
import { MetricsSection } from "./MetricsSection"
import { AveragesSection } from "./AveragesSection"
import { AttentionSection } from "./AttentionSection"
import { IntegritySection } from "./IntegritySection"
import { TopPlayersSection } from "./TopPlayersSection"
import { GalleriesSection } from "./GalleriesSection"
import { ChartsSection } from "./ChartsSection"

export function TrainingStatsCard() {
  const [stats, setStats] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const response = await fetch("/api/admin/face-statistics?top=15")
      const result = await response.json()

      if (!result.success) {
        console.error("[v0] Failed to fetch statistics:", result.error)
        setError(result.error || "Не удалось загрузить статистику")
        setStats(null)
        return
      }

      const data = result.data
      if (!data || !data.players || typeof data.players.total !== "number") {
        console.error("[v0] Invalid statistics data structure:", data)
        setError("Получены некорректные данные статистики")
        setStats(null)
        return
      }

      setStats(data)
      setError(null)
    } catch (error) {
      console.error("[v0] Error fetching statistics:", error)
      setError("Не удалось загрузить статистику")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error || !stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Статистика распознавания</CardTitle>
          <CardDescription>Текущее состояние базы данных лиц</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Ошибка загрузки</AlertTitle>
            <AlertDescription>
              {error || "Не удалось загрузить статистику. Проверьте подключение к базе данных."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Статистика распознавания</CardTitle>
        <CardDescription>Текущее состояние базы данных лиц</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MetricsSection stats={stats} />
        <AveragesSection stats={stats} />
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <AttentionSection stats={stats} />
          <IntegritySection stats={stats} />
        </div>
        <TopPlayersSection stats={stats} />
        <GalleriesSection stats={stats} />
        <ChartsSection stats={stats} />
      </CardContent>
    </Card>
  )
}
