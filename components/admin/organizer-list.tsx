"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Trash2, Pencil } from "lucide-react"
import { deleteOrganizerAction } from "@/app/admin/actions"
import { EditOrganizerDialog } from "./edit-organizer-dialog"
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog"
import type { Organizer } from "@/lib/types"

interface OrganizerListProps {
  organizers: Organizer[]
  onUpdate?: () => void
}

export function OrganizerList({ organizers: initialOrganizers, onUpdate }: OrganizerListProps) {
  // Local state for optimistic updates
  const [localOrganizers, setLocalOrganizers] = useState<Organizer[]>(initialOrganizers)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingOrganizer, setEditingOrganizer] = useState<Organizer | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; organizer: Organizer | null }>({
    open: false,
    organizer: null,
  })

  // Sync with props when they change
  if (initialOrganizers.length !== localOrganizers.length) {
    const initialIds = new Set(initialOrganizers.map(o => o.id))
    const localIds = new Set(localOrganizers.map(o => o.id))
    const hasStructuralChange = initialOrganizers.some(o => !localIds.has(o.id)) || 
                                 localOrganizers.some(o => !initialIds.has(o.id) && !deletingId)
    if (hasStructuralChange) {
      setLocalOrganizers(initialOrganizers)
    }
  }

  function handleDeleteClick(organizer: Organizer) {
    setDeleteConfirm({ open: true, organizer })
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm.organizer) return
    const id = deleteConfirm.organizer.id

    setDeleteConfirm({ open: false, organizer: null })
    setDeletingId(id)
    
    // Optimistic update
    setLocalOrganizers(prev => prev.filter(o => o.id !== id))
    
    const result = await deleteOrganizerAction(id)
    
    if (!result.success) {
      // Rollback on error
      setLocalOrganizers(initialOrganizers)
      alert("Ошибка при удалении")
    }
    
    setDeletingId(null)
  }

  if (localOrganizers.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[200px] items-center justify-center">
          <p className="text-muted-foreground">Нет организаторов</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid gap-2">
        {localOrganizers.map((organizer) => (
          <Card key={organizer.id}>
            <CardContent className="flex items-center justify-between p-4">
              <span className="font-medium">{organizer.name}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingOrganizer(organizer)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteClick(organizer)}
                  disabled={deletingId === organizer.id}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editingOrganizer && (
        <EditOrganizerDialog
          organizer={editingOrganizer}
          open={!!editingOrganizer}
          onOpenChange={(open) => !open && setEditingOrganizer(null)}
          onSuccess={onUpdate}
        />
      )}

      <DeleteConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, organizer: open ? deleteConfirm.organizer : null })}
        onConfirm={handleDeleteConfirm}
        description={`Вы уверены, что хотите удалить организатора "${deleteConfirm.organizer?.name}"? Это действие невозможно отменить.`}
      />
    </>
  )
}
