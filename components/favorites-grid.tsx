"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect, useMemo } from "react"
import { Star } from "lucide-react"
import { RowsPhotoAlbum, MasonryPhotoAlbum } from "react-photo-album"
import "react-photo-album/rows.css"
import "react-photo-album/masonry.css"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Favorite } from "@/lib/types"

interface RemoveDialogData {
  imageId: string
  filename: string
}

interface FavoritesGridProps {
  favorites: (Favorite & {
    gallery_images?: {
      id: string
      slug?: string
      gallery_id: string
      gallery_slug?: string
      image_url: string
      original_url: string
      original_filename: string
      file_size: number | null
      width: number | null
      height: number | null
      created_at: string
    }
  })[]
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile
}

export function FavoritesGrid({ favorites: initialFavorites }: FavoritesGridProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [favorites, setFavorites] = useState(initialFavorites)
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogData | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  function openRemoveDialog(imageId: string, filename: string) {
    setRemoveDialog({ imageId, filename })
  }

  async function confirmRemove() {
    if (!removeDialog) return
    const imageId = removeDialog.imageId
    setRemoveDialog(null)
    setLoading(imageId)
    try {
      const res = await fetch(`/api/favorites/${imageId}`, { method: "POST" })
      if (res.ok) {
        setFavorites(prev => prev.filter(f => f.image_id !== imageId))
      }
    } catch (error) {
      console.error("Error removing from favorites:", error)
    } finally {
      setLoading(null)
    }
  }

  const photos = useMemo(() => {
    return favorites
      .filter((f) => f.gallery_images)
      .map((favorite) => {
        const image = favorite.gallery_images!
        const gallerySlug = image.gallery_slug || image.gallery_id
        const photoSlug = image.slug || image.id

        return {
          src: image.image_url || "/placeholder.svg",
          width: image.width || 1200,
          height: image.height || 800,
          key: favorite.id,
          href: `/gallery/${gallerySlug}?photo=${photoSlug}`,
          filename: image.original_filename,
          imageId: image.id,
        }
      })
  }, [favorites])

  const handleClick = ({ index }: { index: number }) => {
    const photo = photos[index]
    if (photo?.href) {
      router.push(photo.href)
    }
  }

  const renderPhoto = (
    { onClick }: { onClick?: () => void },
    { photo, width, height }: { photo: typeof photos[0]; width: number; height: number }
  ) => {
    const isLoading = loading === photo.imageId

    return (
      <div
        className="relative overflow-hidden rounded-lg group cursor-pointer"
        style={{ width, height }}
        onClick={onClick}
      >
        <img
          src={photo.src}
          alt={photo.filename}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />

        {/* Favorite star button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            openRemoveDialog(photo.imageId, photo.filename)
          }}
          disabled={isLoading}
          className="absolute top-2 right-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity text-yellow-400 hover:text-yellow-300 p-1.5 rounded-md disabled:opacity-50"
          title="Удалить из избранного"
        >
          <Star className="w-6 h-6 fill-current" />
        </button>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center pointer-events-none">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    )
  }

  if (photos.length === 0) {
    return null
  }

  return (
    <>
      {isMobile ? (
        <RowsPhotoAlbum
          photos={photos}
          targetRowHeight={350}
          onClick={handleClick}
          render={{ photo: renderPhoto }}
          spacing={4}
        />
      ) : (
        <MasonryPhotoAlbum
          photos={photos}
          columns={(containerWidth) => {
            if (containerWidth < 900) return 2
            if (containerWidth < 1400) return 3
            return 4
          }}
          onClick={handleClick}
          render={{ photo: renderPhoto }}
          spacing={8}
        />
      )}

      {/* Remove from favorites confirmation dialog */}
      <AlertDialog open={!!removeDialog} onOpenChange={(open) => !open && setRemoveDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить из избранного?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                Вы действительно хотите удалить фото <strong>{removeDialog?.filename}</strong> из избранных?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
