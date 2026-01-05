"use client"

import { useState, useEffect, useMemo } from "react"
import { ArrowLeft } from "lucide-react"
import type { Person, GalleryImage } from "@/lib/types"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ImageLightbox } from "@/components/image-lightbox"
import { usePathname, useSearchParams } from "next/navigation"
import { RowsPhotoAlbum, MasonryPhotoAlbum } from "react-photo-album"
import "react-photo-album/rows.css"
import "react-photo-album/masonry.css"

interface PlayerGalleryViewProps {
  player: Person
  images: (GalleryImage & { gallery?: any })[]
}

function getTelegramLink(nickname: string | null | undefined): string | null {
  if (!nickname) return null
  const username = nickname.startsWith("@") ? nickname.slice(1) : nickname
  return `https://t.me/${username}`
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile
}

export function PlayerGalleryView({ player, images }: PlayerGalleryViewProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()

  useEffect(() => {
    setLightboxOpen(false)
  }, [pathname])

  const formatShortDate = (dateString: string | null | undefined) => {
    if (!dateString) return ""
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    return `${day}.${month}`
  }

  const photos = useMemo(() => {
    return images.map((img) => ({
      src: img.image_url || "/placeholder.svg",
      width: img.width || 1200,
      height: img.height || 800,
      key: img.id,
      gallery: img.gallery,
    }))
  }, [images])

  const lightboxImages = images.map((img, index) => ({
    id: img.id,
    slug: img.slug,
    url: img.image_url,
    originalUrl: img.original_url,
    alt: `${player.real_name} - изображение ${index + 1}`,
    filename: img.original_filename || `image-${index + 1}.jpg`,
    fileSize: img.file_size || undefined,
    width: img.width || undefined,
    height: img.height || undefined,
    galleryTitle: img.gallery?.title,
    galleryDate: img.gallery?.shoot_date,
  }))

  const handleImageClick = ({ index }: { index: number }) => {
    setCurrentIndex(index)
    setLightboxOpen(true)
  }

  useEffect(() => {
    const photoParam = searchParams.get("photo")
    if (photoParam) {
      let photoIndex = images.findIndex((img) => img.slug === photoParam)

      if (photoIndex === -1) {
        photoIndex = images.findIndex((img) => img.id === photoParam)
      }

      if (photoIndex !== -1) {
        setCurrentIndex(photoIndex)
        setLightboxOpen(true)
      }
    }
  }, [searchParams, images])

  const telegramLink = getTelegramLink(player.telegram_username)

  const renderPhoto = (
    { onClick }: { onClick?: () => void },
    { photo, width, height }: { photo: typeof photos[0]; width: number; height: number }
  ) => {
    const gallery = photo.gallery

    return (
      <div
        className="relative overflow-hidden rounded-lg group cursor-pointer"
        onClick={onClick}
      >
        <img
          src={photo.src}
          width={width}
          height={height}
          alt=""
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 pointer-events-none" />
        {gallery && (
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
            <p className="text-white text-xs leading-tight">
              {gallery.title} {formatShortDate(gallery.shoot_date)}
            </p>
          </div>
        )}
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <h1 className="text-3xl font-semibold mb-4">{player.real_name}</h1>
        <p className="text-muted-foreground mb-6">У этого игрока пока нет фотографий</p>
        <Link href="/players">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Вернуться к списку игроков
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl pl-4 pr-12 py-2">
        <Link href="/players">
          <Button variant="ghost" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к игрокам
          </Button>
        </Link>
        <h1 className="text-3xl font-bold mb-2">{player.real_name}</h1>
        {telegramLink && (
          <a
            href={telegramLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted"
          >
            {player.telegram_username}
          </a>
        )}
      </div>

      <div className="px-1 sm:px-2 pb-8">
        {isMobile ? (
          <RowsPhotoAlbum
            photos={photos}
            targetRowHeight={150}
            onClick={handleImageClick}
            render={{ photo: renderPhoto }}
            spacing={4}
          />
        ) : (
          <MasonryPhotoAlbum
            photos={photos}
            columns={(containerWidth) => {
              if (containerWidth < 768) return 2
              if (containerWidth < 1024) return 3
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
        currentPlayerId={player.id}
        currentPlayerSlug={player.slug}
      />
    </div>
  )
}
