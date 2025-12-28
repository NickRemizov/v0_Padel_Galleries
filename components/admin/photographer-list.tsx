"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Trash2, Pencil } from "lucide-react"
import { deletePhotographerAction } from "@/app/admin/actions"
import { EditPhotographerDialog } from "./edit-photographer-dialog"
import type { Photographer } from "@/lib/types"

interface PhotographerListProps {
  photographers: Photographer[]
  onUpdate?: () => void
}

export function PhotographerList({ photographers: initialPhotographers, onUpdate }: PhotographerListProps) {
  // Local state for optimistic updates
  const [localPhotographers, setLocalPhotographers] = useState<Photographer[]>(initialPhotographers)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingPhotographer, setEditingPhotographer] = useState<Photographer | null>(null)

  // Sync with props when they change
  if (initialPhotographers.length !== localPhotographers.length) {
    const initialIds = new Set(initialPhotographers.map(p => p.id))
    const localIds = new Set(localPhotographers.map(p => p.id))
    const hasStructuralChange = initialPhotographers.some(p => !localIds.has(p.id)) || 
                                 localPhotographers.some(p => !initialIds.has(p.id) && !deletingId)
    if (hasStructuralChange) {
      setLocalPhotographers(initialPhotographers)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Вы уверены, что хотите удалить этого фотографа?")) return

    setDeletingId(id)
    
    // Optimistic update
    setLocalPhotographers(prev => prev.filter(p => p.id !== id))
    
    const result = await deletePhotographerAction(id)
    
    if (!result.success) {
      // Rollback on error
      setLocalPhotographers(initialPhotographers)
      alert("Ошибка при удалении")
    }
    
    setDeletingId(null)
  }

  if (localPhotographers.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[200px] items-center justify-center">
          <p className="text-muted-foreground">Нет фотографов</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid gap-2">
        {localPhotographers.map((photographer) => (
          <Card key={photographer.id}>
            <CardContent className="flex items-center justify-between p-4">
              <span className="font-medium">{photographer.name}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingPhotographer(photographer)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(photographer.id)}
                  disabled={deletingId === photographer.id}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editingPhotographer && (
        <EditPhotographerDialog
          photographer={editingPhotographer}
          open={!!editingPhotographer}
          onOpenChange={(open) => !open && setEditingPhotographer(null)}
          onSuccess={onUpdate}
        />
      )}
    </>
  )
}
