"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect, useMemo } from "react"
import { RowsPhotoAlbum, MasonryPhotoAlbum } from "react-photo-album"
import "react-photo-album/rows.css"
import "react-photo-album/masonry.css"
import type { Favorite } from "@/lib/types"

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

export function FavoritesGrid({ favorites }: FavoritesGridProps) {
  const router = useRouter()
  const isMobile = useIsMobile()

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
      </div>
    )
  }

  if (photos.length === 0) {
    return null
  }

  return isMobile ? (
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
  )
}
