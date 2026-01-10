"use client"

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
        {/* Avatar with transparent background */}
        <div className="relative w-full">
          <Image
            src={player.avatar_url}
            alt={player.real_name}
            width={800}
            height={1200}
            className="w-full h-auto"
            style={{ objectFit: "contain" }}
            priority
          />

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
                fontSize: "clamp(48px, 12vw, 96px)",
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

          {/* Stats badges on the right - different sizes per original design */}
          <div className="absolute right-3 top-12 flex flex-col gap-2">
            {/* Level - BIGGEST badge: 137x125, font 24/56 */}
            <div
              className="text-center flex flex-col justify-center"
              style={{
                border: "4px solid white",
                borderRadius: "24px",
                width: "clamp(100px, 20vw, 137px)",
                height: "clamp(90px, 18vw, 125px)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-oswald), sans-serif",
                  fontSize: "clamp(18px, 4vw, 24px)",
                  color: "white",
                }}
              >
                Уровень
              </div>
              <div
                style={{
                  fontFamily: "var(--font-oswald), sans-serif",
                  fontSize: "clamp(36px, 8vw, 56px)",
                  fontWeight: 600,
                  color: "white",
                  lineHeight: 1,
                }}
              >
                {stats.level}
              </div>
            </div>

            {/* Tournaments - smaller: 117x105, font 20/48 */}
            <div
              className="text-center flex flex-col justify-center"
              style={{
                border: "4px solid white",
                borderRadius: "24px",
                width: "clamp(85px, 17vw, 117px)",
                height: "clamp(75px, 15vw, 105px)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-oswald), sans-serif",
                  fontSize: "clamp(14px, 3vw, 20px)",
                  color: "white",
                }}
              >
                Турниры
              </div>
              <div
                style={{
                  fontFamily: "var(--font-oswald), sans-serif",
                  fontSize: "clamp(28px, 6vw, 48px)",
                  fontWeight: 600,
                  color: "white",
                  lineHeight: 1,
                }}
              >
                {stats.tournaments}
              </div>
            </div>

            {/* Photos - smaller: 117x105, font 20/42 */}
            <div
              className="text-center flex flex-col justify-center"
              style={{
                border: "4px solid white",
                borderRadius: "24px",
                width: "clamp(85px, 17vw, 117px)",
                height: "clamp(75px, 15vw, 105px)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-oswald), sans-serif",
                  fontSize: "clamp(14px, 3vw, 20px)",
                  color: "white",
                }}
              >
                Фото
              </div>
              <div
                style={{
                  fontFamily: "var(--font-oswald), sans-serif",
                  fontSize: "clamp(24px, 5.5vw, 42px)",
                  fontWeight: 600,
                  color: "white",
                  lineHeight: 1,
                }}
              >
                {stats.photosCount}
              </div>
            </div>

            {/* Galleries - smaller: 117x105, font 20/48 */}
            <div
              className="text-center flex flex-col justify-center"
              style={{
                border: "4px solid white",
                borderRadius: "24px",
                width: "clamp(85px, 17vw, 117px)",
                height: "clamp(75px, 15vw, 105px)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-oswald), sans-serif",
                  fontSize: "clamp(14px, 3vw, 20px)",
                  color: "white",
                }}
              >
                Галереи
              </div>
              <div
                style={{
                  fontFamily: "var(--font-oswald), sans-serif",
                  fontSize: "clamp(28px, 6vw, 48px)",
                  fontWeight: 600,
                  color: "white",
                  lineHeight: 1,
                }}
              >
                {stats.galleriesCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Photo Gallery */}
      <div className="p-4">
        <h2
          className="text-white text-2xl mb-4"
          style={{ fontFamily: "var(--font-oswald), sans-serif" }}
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
