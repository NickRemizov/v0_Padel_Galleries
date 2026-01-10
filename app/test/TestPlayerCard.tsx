"use client"

import { useState } from "react"
import Image from "next/image"
import { RowsPhotoAlbum } from "react-photo-album"
import "react-photo-album/rows.css"

interface PlayerStats {
  level: string
  tournaments: number
  photosCount: number
  galleriesCount: number
}

interface Photo {
  id: string
  slug: string
  image_url: string
  width: number
  height: number
  gallery_id: string
  gallery_title: string
}

interface TestPlayerCardProps {
  player: {
    id: string
    real_name: string
    telegram_username: string
    avatar_url: string
  }
  photos: Photo[]
  stats: PlayerStats
}

export function TestPlayerCard({ player, photos, stats }: TestPlayerCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false)

  // Photo album data
  const albumPhotos = photos.map((p) => ({
    src: p.image_url,
    width: p.width,
    height: p.height,
    key: p.id,
  }))

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A0F1C" }}>
      {/* Player Card */}
      <div className="relative w-full" style={{ maxWidth: "100vw" }}>
        {/* Avatar as background - original proportions */}
        <div className="relative w-full">
          <Image
            src={player.avatar_url}
            alt={player.real_name}
            width={800}
            height={1200}
            className="w-full h-auto"
            style={{ objectFit: "contain" }}
            onLoad={() => setImageLoaded(true)}
            priority
          />

          {/* Overlay content */}
          {imageLoaded && (
            <>
              {/* Name at bottom */}
              <div
                className="absolute left-4 right-4 bottom-4"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.3)",
                  borderRadius: "20px",
                  padding: "16px 24px",
                }}
              >
                <h1
                  style={{
                    fontFamily: "var(--font-lobster), cursive",
                    fontSize: "clamp(32px, 8vw, 64px)",
                    color: "white",
                    textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
                    lineHeight: 1.1,
                  }}
                >
                  {player.real_name.split(" ").map((word, i) => (
                    <span key={i}>
                      {word}
                      {i === 0 && <br />}
                    </span>
                  ))}
                </h1>
              </div>

              {/* Stats badges on the right */}
              <div className="absolute right-4 top-16 flex flex-col gap-3">
                {/* Level */}
                <div
                  className="text-center"
                  style={{
                    border: "3px solid white",
                    borderRadius: "16px",
                    padding: "8px 16px",
                    minWidth: "100px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-oswald), sans-serif",
                      fontSize: "16px",
                      color: "white",
                    }}
                  >
                    Уровень
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-oswald), sans-serif",
                      fontSize: "36px",
                      fontWeight: 600,
                      color: "white",
                    }}
                  >
                    {stats.level}
                  </div>
                </div>

                {/* Tournaments */}
                <div
                  className="text-center"
                  style={{
                    border: "3px solid white",
                    borderRadius: "16px",
                    padding: "8px 16px",
                    minWidth: "100px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-oswald), sans-serif",
                      fontSize: "14px",
                      color: "white",
                    }}
                  >
                    Турниры
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-oswald), sans-serif",
                      fontSize: "32px",
                      fontWeight: 600,
                      color: "white",
                    }}
                  >
                    {stats.tournaments}
                  </div>
                </div>

                {/* Photos */}
                <div
                  className="text-center"
                  style={{
                    border: "3px solid white",
                    borderRadius: "16px",
                    padding: "8px 16px",
                    minWidth: "100px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-oswald), sans-serif",
                      fontSize: "14px",
                      color: "white",
                    }}
                  >
                    Фото
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-oswald), sans-serif",
                      fontSize: "32px",
                      fontWeight: 600,
                      color: "white",
                    }}
                  >
                    {stats.photosCount}
                  </div>
                </div>

                {/* Galleries */}
                <div
                  className="text-center"
                  style={{
                    border: "3px solid white",
                    borderRadius: "16px",
                    padding: "8px 16px",
                    minWidth: "100px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-oswald), sans-serif",
                      fontSize: "14px",
                      color: "white",
                    }}
                  >
                    Галереи
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-oswald), sans-serif",
                      fontSize: "32px",
                      fontWeight: 600,
                      color: "white",
                    }}
                  >
                    {stats.galleriesCount}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Photo Gallery */}
      <div className="p-4">
        <h2
          className="text-white text-2xl mb-4"
          style={{ fontFamily: "'Oswald', sans-serif" }}
        >
          Фотографии
        </h2>
        <RowsPhotoAlbum
          photos={albumPhotos}
          targetRowHeight={200}
          spacing={4}
        />
      </div>
    </div>
  )
}
