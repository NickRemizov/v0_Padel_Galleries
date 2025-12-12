"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Loader2, AlertCircle, Users, Camera, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface Statistics {
  overall: {
    total_people: number
    people_with_verified: number
    total_faces: number
    total_verified_faces: number
    avg_faces_per_person: string
    min_faces: number
    max_faces: number
  }
  distribution: Array<{
    threshold: string
    people_count: number
    total_faces: number
    percentage: string
  }>
  histogram: Array<{
    face_range: string
    people_count: number
    total_faces: number
  }>
}

export function TrainingStatsCard() {
  const [stats, setStats] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    try {
      const response = await fetch("/api/admin/face-statistics")
      const data = await response.json()

      if (!data || !data.overall || typeof data.overall.total_people !== "number") {
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

  if (error || !stats || !stats.overall) {
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

  const peopleWithoutVerified = stats.overall.total_people - stats.overall.people_with_verified
  const unverifiedFaces = stats.overall.total_faces - stats.overall.total_verified_faces

  return (
    <Card>
      <CardHeader>
        <CardTitle>Статистика распознавания</CardTitle>
        <CardDescription>Текущее состояние базы данных лиц</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats - Two rows */}
        <div className="space-y-4">
          {/* Игроки */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Игроки</h4>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Всего в базе</div>
                <div className="text-2xl font-bold">{stats.overall.total_people}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />С подтверждёнными фото
                </div>
                <div className="text-2xl font-bold text-green-600">{stats.overall.people_with_verified}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Без подтверждённых фото</div>
                <div className="text-2xl font-bold text-muted-foreground">{peopleWithoutVerified}</div>
              </div>
            </div>
          </div>

          {/* Лица */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <Camera className="h-5 w-5 text-muted-foreground" />
              <h4 className="font-medium">Лица на фото</h4>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Всего записей</div>
                <div className="text-2xl font-bold">{stats.overall.total_faces}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  Подтверждённых (verified)
                </div>
                <div className="text-2xl font-bold text-green-600">{stats.overall.total_verified_faces}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Неподтверждённых</div>
                <div className="text-2xl font-bold text-muted-foreground">{unverifiedFaces}</div>
              </div>
            </div>
          </div>

          {/* Средние показатели */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-sm text-muted-foreground">Средн. фото на игрока</div>
              <div className="text-xl font-bold">{stats.overall.avg_faces_per_person}</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-sm text-muted-foreground">Мин. фото</div>
              <div className="text-xl font-bold">{stats.overall.min_faces}</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-sm text-muted-foreground">Макс. фото</div>
              <div className="text-xl font-bold">{stats.overall.max_faces}</div>
            </div>
          </div>
        </div>

        {/* Distribution */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Распределение по количеству лиц</h4>
          <p className="text-xs text-muted-foreground">Сколько игроков имеют N и более подтверждённых фото</p>
          {stats.distribution.map((item) => (
            <div key={item.threshold} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>{item.threshold}</span>
                <span className="text-muted-foreground">
                  {item.people_count} людей ({item.percentage}%)
                </span>
              </div>
              <Progress value={Number.parseFloat(item.percentage)} />
            </div>
          ))}
        </div>

        {/* Histogram */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Гистограмма распределения</h4>
          <p className="text-xs text-muted-foreground">
            Распределение игроков по диапазонам количества подтверждённых фото
          </p>
          {stats.histogram.map((item) => (
            <div key={item.face_range} className="flex items-center gap-4">
              <div className="min-w-[100px] text-sm font-medium">{item.face_range}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-6 rounded bg-primary transition-all"
                    style={{
                      width: `${stats.overall.people_with_verified > 0 ? (item.people_count / stats.overall.people_with_verified) * 100 : 0}%`,
                      minWidth: item.people_count > 0 ? "20px" : "0",
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    {item.people_count} ({item.total_faces} лиц)
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
