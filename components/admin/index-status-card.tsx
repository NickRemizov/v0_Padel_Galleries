"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Database, RefreshCw, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getIndexStatusAction, rebuildIndexAction, type IndexStatus } from "@/app/admin/actions/faces"

export function IndexStatusCard() {
  const [status, setStatus] = useState<IndexStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [rebuilding, setRebuilding] = useState(false)
  const { toast } = useToast()

  const fetchStatus = useCallback(async () => {
    try {
      const result = await getIndexStatusAction()
      if (result.success && result.data) {
        setStatus(result.data)
      }
    } catch (error) {
      console.error("Failed to fetch index status:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleRebuild = async () => {
    setRebuilding(true)
    try {
      const result = await rebuildIndexAction()

      if (result.success && result.data) {
        toast({
          title: "Индекс перестроен",
          description: `${result.data.new_descriptor_count} лиц в индексе`,
        })
        await fetchStatus()
      } else {
        toast({
          title: "Ошибка",
          description: result.error || "Не удалось перестроить индекс",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось перестроить индекс",
        variant: "destructive",
      })
    } finally {
      setRebuilding(false)
    }
  }

  const formatTimeAgo = (isoString: string | undefined) => {
    if (!isoString) return "неизвестно"

    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    // Also show actual time in HH:MM format
    const timeStr = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })

    if (diffMins < 1) return `только что (${timeStr})`
    if (diffMins < 60) return `${diffMins} мин. назад (${timeStr})`
    if (diffHours < 24) {
      const remainingMins = diffMins % 60
      if (remainingMins > 0) {
        return `${diffHours} ч. ${remainingMins} мин. назад (${timeStr})`
      }
      return `${diffHours} ч. назад (${timeStr})`
    }
    return `${diffDays} дн. назад (${timeStr})`
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            <CardTitle>Индекс распознавания</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          <CardTitle>Индекс распознавания</CardTitle>
        </div>
        <CardDescription>
          HNSW индекс для быстрого поиска похожих лиц
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="space-y-1 text-sm">
            {status?.loaded ? (
              <>
                <div>
                  <span className="text-muted-foreground">В индексе:</span>{" "}
                  <span className="font-medium">{status.total_embeddings?.toLocaleString()} лиц</span>
                  <span className="text-muted-foreground"> ({status.unique_people} игроков)</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Исключено:</span>{" "}
                  <span className="font-medium">{status.excluded_count || 0}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Последний rebuild:</span>{" "}
                  <span className="font-medium">{formatTimeAgo(status.last_rebuild_time)}</span>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">Индекс не загружен</div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRebuild}
            disabled={rebuilding}
          >
            {rebuilding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Rebuild...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Перестроить
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
