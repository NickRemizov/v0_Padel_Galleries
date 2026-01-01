"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Trash2, Pencil, MapPin, Globe, Link2, ExternalLink } from "lucide-react"
import { deleteLocationAction } from "@/app/admin/actions/entities"
import { EditLocationDialog } from "./edit-location-dialog"
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog"
import type { Location } from "@/lib/types"

interface LocationListProps {
  locations: Location[]
  onUpdate?: () => void
}

export function LocationList({ locations: initialLocations, onUpdate }: LocationListProps) {
  // Local state for optimistic updates
  const [localLocations, setLocalLocations] = useState<Location[]>(initialLocations)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; location: Location | null }>({
    open: false,
    location: null,
  })

  // Sync with props when they change
  if (initialLocations.length !== localLocations.length) {
    const initialIds = new Set(initialLocations.map(l => l.id))
    const localIds = new Set(localLocations.map(l => l.id))
    const hasStructuralChange = initialLocations.some(l => !localIds.has(l.id)) || 
                                 localLocations.some(l => !initialIds.has(l.id) && !deletingId)
    if (hasStructuralChange) {
      setLocalLocations(initialLocations)
    }
  }

  function handleDeleteClick(location: Location) {
    setDeleteConfirm({ open: true, location })
  }

  async function handleDeleteConfirm() {
    if (!deleteConfirm.location) return
    const id = deleteConfirm.location.id

    setDeleteConfirm({ open: false, location: null })
    setDeletingId(id)
    
    // Optimistic update
    setLocalLocations(prev => prev.filter(l => l.id !== id))
    
    const result = await deleteLocationAction(id)
    
    if (!result.success) {
      // Rollback on error
      setLocalLocations(initialLocations)
      alert("Ошибка при удалении")
    }
    
    setDeletingId(null)
  }

  if (localLocations.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[200px] items-center justify-center">
          <p className="text-muted-foreground">Нет площадок</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid gap-3">
        {localLocations.map((location) => (
          <Card key={location.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="font-medium text-lg">{location.name}</div>
                  
                  {location.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>{location.address}</span>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-3">
                    {location.maps_url && (
                      <a
                        href={location.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                      >
                        <Globe className="h-4 w-4" />
                        Карта
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    
                    {location.website_url && (
                      <a
                        href={location.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                      >
                        <Link2 className="h-4 w-4" />
                        Сайт
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setEditingLocation(location)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteClick(location)}
                    disabled={deletingId === location.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editingLocation && (
        <EditLocationDialog
          location={editingLocation}
          open={!!editingLocation}
          onOpenChange={(open) => !open && setEditingLocation(null)}
          onSuccess={onUpdate}
        />
      )}

      <DeleteConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ open, location: open ? deleteConfirm.location : null })}
        onConfirm={handleDeleteConfirm}
        description={`Вы уверены, что хотите удалить площадку "${deleteConfirm.location?.name}"? Это действие невозможно отменить.`}
      />
    </>
  )
}
