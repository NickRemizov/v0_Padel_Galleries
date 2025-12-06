"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { AddGalleryDialog } from "@/components/admin/add-gallery-dialog"
import { GalleryList } from "@/components/admin/gallery-list"
import { Button } from "@/components/ui/button"
import type { Gallery, Photographer, Location, Organizer } from "@/lib/types"
import { logger } from "@/lib/logger"

export function GalleriesManager() {
  const [galleries, setGalleries] = useState<Gallery[]>([])
  const [photographers, setPhotographers] = useState<Photographer[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [organizers, setOrganizers] = useState<Organizer[]>([])
  const [sortBy, setSortBy] = useState<"created_at" | "shoot_date">("created_at")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [sortBy])

  async function loadData() {
    setLoading(true)
    logger.debug("GalleriesManager", "Loading galleries data", { sortBy })

    const supabase = createClient()

    const [{ data: galleriesData }, { data: photographersData }, { data: locationsData }, { data: organizersData }] =
      await Promise.all([
        supabase
          .from("galleries")
          .select(
            `
        *,
        photographers (
          id,
          name
        ),
        locations (
          id,
          name
        ),
        organizers (
          id,
          name
        ),
        gallery_images (
          id
        )
      `,
          )
          .order(sortBy, { ascending: false }),
        supabase.from("photographers").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
        supabase.from("organizers").select("*").order("name"),
      ])

    setGalleries((galleriesData as Gallery[]) || [])
    setPhotographers(photographersData || [])
    setLocations(locationsData || [])
    setOrganizers(organizersData || [])
    setLoading(false)

    logger.debug("GalleriesManager", "Galleries data loaded", {
      galleriesCount: galleriesData?.length || 0,
      photographersCount: photographersData?.length || 0,
    })
  }

  function toggleSort() {
    setSortBy((prev) => (prev === "created_at" ? "shoot_date" : "created_at"))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Управление галереями</h2>
          <p className="text-sm text-muted-foreground">Добавляйте, редактируйте и удаляйте галереи</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={toggleSort} disabled={loading}>
            {sortBy === "created_at" ? "По дате события" : "По дате добавления"}
          </Button>
          <AddGalleryDialog
            photographers={photographers}
            locations={locations}
            organizers={organizers}
            onSuccess={loadData}
          />
        </div>
      </div>

      <GalleryList
        galleries={galleries}
        photographers={photographers}
        locations={locations}
        organizers={organizers}
        onDelete={loadData}
      />
    </div>
  )
}
