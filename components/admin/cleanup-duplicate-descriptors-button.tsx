"use client"

import { useState } from "react"
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
import { cleanupDuplicateFacesAction } from "@/app/admin/actions"
import { Loader2 } from "lucide-react"

export function CleanupDuplicateDescriptorsButton() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleCleanup = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await cleanupDuplicateFacesAction()

      if (response.error) {
        alert(`Ошибка: ${response.error}`)
      } else {
        setResult(response.data)
        console.log("[v0] Cleanup completed successfully:", response.data)
      }
    } catch (error: any) {
      console.error("[v0] Error during cleanup:", error)
      alert(`Ошибка: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Удалить дубликаты лиц
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить дубликаты лиц</DialogTitle>
          <DialogDescription>
            Эта операция удалит дублирующие записи в таблице photo_faces, оставив только уникальные лица для каждого
            фото.
          </DialogDescription>
        </DialogHeader>

        {result && (
          <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
            <div className="font-semibold">Результаты очистки:</div>
            <div>Найдено дубликатов: {result.duplicatesFound || 0}</div>
            <div>Удалено: {result.deletedCount || 0}</div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={handleCleanup} disabled={loading} variant="destructive">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? "Удаление..." : "Удалить дубликаты"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
