"use client"

import { useState, useRef } from "react"
import Image from "next/image"
import Draggable from "react-draggable"
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

interface Position {
  x: number
  y: number
}

interface LayoutConfig {
  name: Position
  level: Position
  tournaments: Position
  photos: Position
  galleries: Position
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

const DEFAULT_LAYOUT: LayoutConfig = {
  name: { x: 16, y: 400 },
  level: { x: 250, y: 50 },
  tournaments: { x: 270, y: 180 },
  photos: { x: 270, y: 290 },
  galleries: { x: 270, y: 400 },
}

export function TestPlayerCard({ player, photos, stats }: TestPlayerCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [layout, setLayout] = useState<LayoutConfig>(DEFAULT_LAYOUT)
  const containerRef = useRef<HTMLDivElement>(null)

  // Refs for draggable elements (react-draggable requires them)
  const nameRef = useRef<HTMLDivElement>(null)
  const levelRef = useRef<HTMLDivElement>(null)
  const tournamentsRef = useRef<HTMLDivElement>(null)
  const photosRef = useRef<HTMLDivElement>(null)
  const galleriesRef = useRef<HTMLDivElement>(null)

  const handleDrag = (key: keyof LayoutConfig) => (_: any, data: { x: number; y: number }) => {
    setLayout((prev) => ({
      ...prev,
      [key]: { x: data.x, y: data.y },
    }))
  }

  const handleSave = () => {
    // TODO: Save to database
    console.log("Layout saved:", layout)
    setIsEditing(false)
    alert("Позиции сохранены!\n\n" + JSON.stringify(layout, null, 2))
  }

  const handleReset = () => {
    setLayout(DEFAULT_LAYOUT)
  }

  // Photo album data
  const albumPhotos = photos.map((p) => ({
    src: p.image_url,
    width: p.width,
    height: p.height,
    key: p.id,
  }))

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A0F1C" }}>
      {/* Edit mode toggle */}
      <div className="fixed top-4 left-4 z-50 flex gap-2">
        {isEditing ? (
          <>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              Сохранить
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700"
            >
              Отмена
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
            >
              Сброс
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Редактировать
          </button>
        )}
      </div>

      {/* Player Card */}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{ maxWidth: "100vw", touchAction: isEditing ? "none" : "auto" }}
      >
        {/* Avatar with transparent background */}
        <Image
          src={player.avatar_url}
          alt={player.real_name}
          width={800}
          height={1200}
          className="w-full h-auto"
          style={{ objectFit: "contain" }}
          priority
          draggable={false}
        />

        {/* Draggable Name */}
        <Draggable
          disabled={!isEditing}
          position={layout.name}
          onDrag={handleDrag("name")}
          nodeRef={nameRef}
          bounds="parent"
        >
          <div
            ref={nameRef}
            className="absolute"
            style={{
              top: 0,
              left: 0,
              cursor: isEditing ? "move" : "default",
              backgroundColor: "rgba(255, 255, 255, 0.3)",
              borderRadius: "20px",
              padding: "16px 24px",
              border: isEditing ? "2px dashed yellow" : "none",
            }}
          >
            <h1
              style={{
                fontFamily: "var(--font-lobster), cursive",
                fontSize: "clamp(48px, 12vw, 96px)",
                color: "white",
                textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
                lineHeight: 1.1,
                margin: 0,
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
        </Draggable>

        {/* Draggable Level Badge */}
        <Draggable
          disabled={!isEditing}
          position={layout.level}
          onDrag={handleDrag("level")}
          nodeRef={levelRef}
          bounds="parent"
        >
          <div
            ref={levelRef}
            className="absolute text-center flex flex-col justify-center"
            style={{
              top: 0,
              left: 0,
              cursor: isEditing ? "move" : "default",
              border: isEditing ? "2px dashed yellow" : "4px solid white",
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
        </Draggable>

        {/* Draggable Tournaments Badge */}
        <Draggable
          disabled={!isEditing}
          position={layout.tournaments}
          onDrag={handleDrag("tournaments")}
          nodeRef={tournamentsRef}
          bounds="parent"
        >
          <div
            ref={tournamentsRef}
            className="absolute text-center flex flex-col justify-center"
            style={{
              top: 0,
              left: 0,
              cursor: isEditing ? "move" : "default",
              border: isEditing ? "2px dashed yellow" : "4px solid white",
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
        </Draggable>

        {/* Draggable Photos Badge */}
        <Draggable
          disabled={!isEditing}
          position={layout.photos}
          onDrag={handleDrag("photos")}
          nodeRef={photosRef}
          bounds="parent"
        >
          <div
            ref={photosRef}
            className="absolute text-center flex flex-col justify-center"
            style={{
              top: 0,
              left: 0,
              cursor: isEditing ? "move" : "default",
              border: isEditing ? "2px dashed yellow" : "4px solid white",
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
        </Draggable>

        {/* Draggable Galleries Badge */}
        <Draggable
          disabled={!isEditing}
          position={layout.galleries}
          onDrag={handleDrag("galleries")}
          nodeRef={galleriesRef}
          bounds="parent"
        >
          <div
            ref={galleriesRef}
            className="absolute text-center flex flex-col justify-center"
            style={{
              top: 0,
              left: 0,
              cursor: isEditing ? "move" : "default",
              border: isEditing ? "2px dashed yellow" : "4px solid white",
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
        </Draggable>
      </div>

      {/* Photo Gallery */}
      <div className="p-4">
        <h2
          className="text-white text-2xl mb-4"
          style={{ fontFamily: "var(--font-oswald), sans-serif" }}
        >
          Фотографии
        </h2>
        <RowsPhotoAlbum photos={albumPhotos} targetRowHeight={200} spacing={4} />
      </div>
    </div>
  )
}
