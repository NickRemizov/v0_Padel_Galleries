"use client"

import { useSearchParams } from "next/navigation"
import { useState, useMemo, useEffect } from "react"
import { ArrowLeft } from "lucide-react"
import type { Gallery } from "@/lib/types"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ImageLightbox } from "@/components/image-lightbox"
import { RowsPhotoAlbum, MasonryPhotoAlbum } from "react-photo-album"
import "react-photo-album/rows.css"
import "react-photo-album/masonry.css"

interface GalleryViewProps {
  gallery: Gallery
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

export function GalleryView({ gallery }: GalleryViewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  const images = gallery.gallery_images || []

  const sortedImages = useMemo(() => {
    const imagesCopy = [...images]
    const sortOrder = gallery.sort_order || "filename"

    switch (sortOrder) {
      case "filename":
        return imagesCopy.sort((a, b) => (a.original_filename || "").localeCompare(b.original_filename || ""))
      case "created":
      case "added":
        return imagesCopy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      default:
        return imagesCopy
    }
  }, [images, gallery.sort_order])

  // Photos for react-photo-album
  const photos = useMemo(() => {
    return sortedImages.map((img) => ({
      src: img.image_url || "/placeholder.svg",
      width: img.width || 1200,
      height: img.height || 800,
      key: img.id,
      // Custom data for rendering
      people: img.people || [],
    }))
  }, [sortedImages])

  const lightboxImages = sortedImages.map((img, index) => ({
    id: img.id,
    slug: img.slug,
    url: img.image_url,
    originalUrl: img.original_url,
    alt: `${gallery.title} - изображение ${index + 1}`,
    filename: img.original_filename || `image-${index + 1}.jpg`,
    fileSize: img.file_size,
    width: img.width,
    height: img.height,
  }))

  const handleImageClick = ({ index }: { index: number }) => {
    setCurrentIndex(index)
    setLightboxOpen(true)
  }

  useEffect(() => {
    const photoParam = searchParams.get("photo")
    if (photoParam) {
      let photoIndex = sortedImages.findIndex((img) => img.slug === photoParam)

      if (photoIndex === -1) {
        photoIndex = sortedImages.findIndex((img) => img.id === photoParam)
      }

      if (photoIndex !== -1) {
        setCurrentIndex(photoIndex)
        setLightboxOpen(true)
      } else {
        const numericIndex = Number.parseInt(photoParam, 10)
        if (!isNaN(numericIndex) && numericIndex >= 0 && numericIndex < sortedImages.length) {
          setCurrentIndex(numericIndex)
          setLightboxOpen(true)
        }
      }
    }
  }, [searchParams, sortedImages])

  const renderPhoto = (
    { onClick }: { onClick?: () => void },
    { photo, width, height }: { photo: typeof photos[0]; width: number; height: number }
  ) => {
    const people = photo.people as Array<{ name: string }>

    return (
      <div
        className="relative overflow-hidden rounded-lg group cursor-pointer"
        style={{ width, height }}
        onClick={onClick}
      >
        <img
          src={photo.src}
          alt=""
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 pointer-events-none" />
        {people.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
            <p className="text-white text-xs font-medium leading-tight">
              {people.map((person) => person.name).join(", ")}
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl pl-4 pr-12 py-2">
        <Link href="/">
          <Button variant="ghost" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к галереям
          </Button>
        </Link>
      </div>

      <div className="px-1 sm:px-2 pb-8">
        {images.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>В этой галерее пока нет изображений</p>
          </div>
        ) : isMobile ? (
          <RowsPhotoAlbum
            photos={photos}
            targetRowHeight={350}
            onClick={handleImageClick}
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
            onClick={handleImageClick}
            render={{ photo: renderPhoto }}
            spacing={8}
          />
        )}
      </div>

      <ImageLightbox
        images={lightboxImages}
        currentIndex={currentIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onNavigate={setCurrentIndex}
        galleryId={gallery.id}
        gallerySlug={gallery.slug}
      />
    </div>
  )
}
