"use client"

import { useState, useRef, useMemo } from "react"
import Image from "next/image"
import Draggable from "react-draggable"
import { Resizable } from "re-resizable"
import { RowsPhotoAlbum } from "react-photo-album"
import "react-photo-album/rows.css"

const SNAP_THRESHOLD = 8 // Pixels to trigger snap

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

interface ElementConfig {
  x: number
  y: number
  width: number
  height: number
  hidden?: boolean
}

type TextAlign = "left" | "center" | "right"

interface NameConfig extends ElementConfig {
  align: TextAlign
}

interface LayoutConfig {
  name: NameConfig
  level: ElementConfig
  tournaments: ElementConfig
  photos: ElementConfig
  galleries: ElementConfig
}

interface SnapGuide {
  type: "vertical" | "horizontal"
  position: number
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
  name: { x: 24, y: 408, width: 366, height: 112, align: "left" },
  level: { x: 250, y: 10, width: 140, height: 130 },
  tournaments: { x: 284, y: 148, width: 106, height: 76 },
  photos: { x: 284, y: 232, width: 106, height: 76 },
  galleries: { x: 284, y: 316, width: 106, height: 76 },
}

export function TestPlayerCard({ player, photos, stats }: TestPlayerCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [layout, setLayout] = useState<LayoutConfig>(DEFAULT_LAYOUT)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // Refs for draggable elements
  const nameRef = useRef<HTMLDivElement>(null)
  const levelRef = useRef<HTMLDivElement>(null)
  const tournamentsRef = useRef<HTMLDivElement>(null)
  const photosRef = useRef<HTMLDivElement>(null)
  const galleriesRef = useRef<HTMLDivElement>(null)

  // Get all edges from other elements for snapping
  const getOtherEdges = (currentKey: keyof LayoutConfig) => {
    const edges = { x: [] as number[], y: [] as number[], widths: [] as number[], heights: [] as number[] }
    const keys = Object.keys(layout) as (keyof LayoutConfig)[]

    for (const key of keys) {
      if (key === currentKey) continue
      const el = layout[key]
      // Left, center, right edges
      edges.x.push(el.x, el.x + el.width / 2, el.x + el.width)
      // Top, center, bottom edges
      edges.y.push(el.y, el.y + el.height / 2, el.y + el.height)
      // Sizes for matching
      edges.widths.push(el.width)
      edges.heights.push(el.height)
    }
    return edges
  }

  // Find snap position
  const findSnap = (value: number, targets: number[]): { snapped: number; guide: number | null } => {
    for (const target of targets) {
      if (Math.abs(value - target) < SNAP_THRESHOLD) {
        return { snapped: target, guide: target }
      }
    }
    return { snapped: value, guide: null }
  }

  const handleDrag = (key: keyof LayoutConfig) => (_: any, data: { x: number; y: number }) => {
    const edges = getOtherEdges(key)
    const el = layout[key]
    const newGuides: SnapGuide[] = []

    // Check left edge
    let snapX = findSnap(data.x, edges.x)
    if (snapX.guide !== null) {
      newGuides.push({ type: "vertical", position: snapX.guide })
    } else {
      // Check right edge
      const rightSnap = findSnap(data.x + el.width, edges.x)
      if (rightSnap.guide !== null) {
        snapX = { snapped: rightSnap.guide - el.width, guide: rightSnap.guide }
        newGuides.push({ type: "vertical", position: rightSnap.guide })
      } else {
        // Check center
        const centerSnap = findSnap(data.x + el.width / 2, edges.x)
        if (centerSnap.guide !== null) {
          snapX = { snapped: centerSnap.guide - el.width / 2, guide: centerSnap.guide }
          newGuides.push({ type: "vertical", position: centerSnap.guide })
        }
      }
    }

    // Check top edge
    let snapY = findSnap(data.y, edges.y)
    if (snapY.guide !== null) {
      newGuides.push({ type: "horizontal", position: snapY.guide })
    } else {
      // Check bottom edge
      const bottomSnap = findSnap(data.y + el.height, edges.y)
      if (bottomSnap.guide !== null) {
        snapY = { snapped: bottomSnap.guide - el.height, guide: bottomSnap.guide }
        newGuides.push({ type: "horizontal", position: bottomSnap.guide })
      } else {
        // Check center
        const centerSnap = findSnap(data.y + el.height / 2, edges.y)
        if (centerSnap.guide !== null) {
          snapY = { snapped: centerSnap.guide - el.height / 2, guide: centerSnap.guide }
          newGuides.push({ type: "horizontal", position: centerSnap.guide })
        }
      }
    }

    setGuides(newGuides)
    setLayout((prev) => ({
      ...prev,
      [key]: { ...prev[key], x: snapX.snapped, y: snapY.snapped },
    }))
  }

  const handleDragStop = () => {
    setGuides([])
  }

  const handleResize = (key: keyof LayoutConfig) => (_: any, __: any, ref: HTMLElement) => {
    const edges = getOtherEdges(key)
    let newWidth = ref.offsetWidth
    let newHeight = ref.offsetHeight
    const newGuides: SnapGuide[] = []

    // Snap width to other elements' widths
    for (const w of edges.widths) {
      if (Math.abs(newWidth - w) < SNAP_THRESHOLD) {
        newWidth = w
        break
      }
    }

    // Snap height to other elements' heights
    for (const h of edges.heights) {
      if (Math.abs(newHeight - h) < SNAP_THRESHOLD) {
        newHeight = h
        break
      }
    }

    setGuides(newGuides)
    setLayout((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        width: newWidth,
        height: newHeight,
      },
    }))
  }

  const handleSave = () => {
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

  const editBorder = "2px dashed yellow"
  const resizeHandleStyle = {
    background: "yellow",
    borderRadius: "50%",
  }

  // Size indicator component
  const SizeIndicator = ({ width, height }: { width: number; height: number }) => (
    <div
      style={{
        position: "absolute",
        bottom: -20,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: "10px",
        color: "yellow",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: "2px 6px",
        borderRadius: "4px",
        whiteSpace: "nowrap",
      }}
    >
      {width}×{height}
    </div>
  )

  // Hide element
  const hideElement = (key: keyof LayoutConfig) => {
    setLayout((prev) => ({
      ...prev,
      [key]: { ...prev[key], hidden: true },
    }))
  }

  // Delete button component
  const DeleteButton = ({ elementKey }: { elementKey: keyof LayoutConfig }) => (
    <div
      onClick={() => hideElement(elementKey)}
      onTouchEnd={(e) => {
        e.preventDefault()
        e.stopPropagation()
        hideElement(elementKey)
      }}
      style={{
        position: "absolute",
        top: -12,
        right: -12,
        width: 28,
        height: 28,
        backgroundColor: "red",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: 18,
        fontWeight: "bold",
        cursor: "pointer",
        zIndex: 100,
        border: "2px solid white",
      }}
    >
      ×
    </div>
  )

  // Alignment toggle for name
  const AlignmentToggle = () => (
    <div
      style={{
        position: "absolute",
        top: -40,
        left: 0,
        display: "flex",
        gap: 6,
        backgroundColor: "rgba(0,0,0,0.9)",
        borderRadius: 6,
        padding: 6,
        zIndex: 100,
      }}
    >
      {(["left", "center", "right"] as TextAlign[]).map((align) => (
        <div
          key={align}
          onClick={() => setLayout((prev) => ({ ...prev, name: { ...prev.name, align } }))}
          onTouchEnd={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setLayout((prev) => ({ ...prev, name: { ...prev.name, align } }))
          }}
          style={{
            width: 36,
            height: 36,
            border: layout.name.align === align ? "2px solid yellow" : "1px solid #666",
            borderRadius: 6,
            backgroundColor: layout.name.align === align ? "rgba(255,255,0,0.3)" : "transparent",
            color: "white",
            cursor: "pointer",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {align === "left" ? "◀" : align === "center" ? "◆" : "▶"}
        </div>
      ))}
    </div>
  )

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

        {/* Snap guide lines */}
        {isEditing && guides.map((guide, i) => (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={guide.type === "vertical" ? {
              left: guide.position,
              top: 0,
              bottom: 0,
              width: 1,
              backgroundColor: "cyan",
              boxShadow: "0 0 4px cyan",
            } : {
              top: guide.position,
              left: 0,
              right: 0,
              height: 1,
              backgroundColor: "cyan",
              boxShadow: "0 0 4px cyan",
            }}
          />
        ))}

        {/* Draggable & Resizable Name */}
        {!layout.name.hidden && (
          <Draggable
            disabled={!isEditing}
            position={{ x: layout.name.x, y: layout.name.y }}
            onDrag={handleDrag("name")}
            onStop={handleDragStop}
            nodeRef={nameRef}
            bounds="parent"
          >
            <div
              ref={nameRef}
              className="absolute"
              style={{ top: 0, left: 0, cursor: isEditing ? "move" : "default" }}
            >
              <Resizable
                size={{ width: layout.name.width, height: layout.name.height }}
                onResizeStop={handleResize("name")}
                enable={isEditing ? undefined : false}
                handleStyles={isEditing ? {
                  bottomRight: { ...resizeHandleStyle, width: 12, height: 12, right: -6, bottom: -6 },
                } : {}}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.3)",
                  borderRadius: "20px",
                  padding: "12px 20px",
                  border: isEditing ? editBorder : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: layout.name.align === "left" ? "flex-start" : layout.name.align === "right" ? "flex-end" : "center",
                }}
              >
                {isEditing && <DeleteButton elementKey="name" />}
                {isEditing && <AlignmentToggle />}
                {isEditing && <SizeIndicator width={layout.name.width} height={layout.name.height} />}
                <h1
                  style={{
                    fontFamily: "var(--font-lobster), cursive",
                    fontSize: `${Math.min(layout.name.width / 8, layout.name.height / 2.5)}px`,
                    color: "white",
                    textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
                    lineHeight: 1.1,
                    margin: 0,
                    textAlign: layout.name.align,
                  }}
                >
                  {player.real_name.split(" ").map((word, i) => (
                    <span key={i}>
                      {word}
                      {i === 0 && <br />}
                    </span>
                  ))}
                </h1>
              </Resizable>
            </div>
          </Draggable>
        )}

        {/* Draggable & Resizable Level Badge */}
        {!layout.level.hidden && (
          <Draggable
            disabled={!isEditing}
            position={{ x: layout.level.x, y: layout.level.y }}
            onDrag={handleDrag("level")}
            onStop={handleDragStop}
            nodeRef={levelRef}
            bounds="parent"
          >
            <div
              ref={levelRef}
              className="absolute"
              style={{ top: 0, left: 0, cursor: isEditing ? "move" : "default" }}
            >
              <Resizable
                size={{ width: layout.level.width, height: layout.level.height }}
                onResizeStop={handleResize("level")}
                enable={isEditing ? undefined : false}
                handleStyles={isEditing ? {
                  bottomRight: { ...resizeHandleStyle, width: 10, height: 10, right: -5, bottom: -5 },
                } : {}}
                style={{
                  border: isEditing ? editBorder : "4px solid white",
                  borderRadius: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isEditing && <DeleteButton elementKey="level" />}
                {isEditing && <SizeIndicator width={layout.level.width} height={layout.level.height} />}
                <div
                  style={{
                    fontFamily: "var(--font-oswald), sans-serif",
                    fontSize: `${Math.max(14, layout.level.height / 5)}px`,
                    color: "white",
                  }}
                >
                  Уровень
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-oswald), sans-serif",
                    fontSize: `${Math.max(24, layout.level.height / 2.2)}px`,
                    fontWeight: 600,
                    color: "white",
                    lineHeight: 1,
                  }}
                >
                  {stats.level}
                </div>
              </Resizable>
            </div>
          </Draggable>
        )}

        {/* Draggable & Resizable Tournaments Badge */}
        {!layout.tournaments.hidden && (
          <Draggable
            disabled={!isEditing}
            position={{ x: layout.tournaments.x, y: layout.tournaments.y }}
            onDrag={handleDrag("tournaments")}
            onStop={handleDragStop}
            nodeRef={tournamentsRef}
            bounds="parent"
          >
            <div
              ref={tournamentsRef}
              className="absolute"
              style={{ top: 0, left: 0, cursor: isEditing ? "move" : "default" }}
            >
              <Resizable
                size={{ width: layout.tournaments.width, height: layout.tournaments.height }}
                onResizeStop={handleResize("tournaments")}
                enable={isEditing ? undefined : false}
                handleStyles={isEditing ? {
                  bottomRight: { ...resizeHandleStyle, width: 10, height: 10, right: -5, bottom: -5 },
                } : {}}
                style={{
                  border: isEditing ? editBorder : "4px solid white",
                  borderRadius: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isEditing && <DeleteButton elementKey="tournaments" />}
                {isEditing && <SizeIndicator width={layout.tournaments.width} height={layout.tournaments.height} />}
                <div
                  style={{
                    fontFamily: "var(--font-oswald), sans-serif",
                    fontSize: `${Math.max(12, layout.tournaments.height / 5)}px`,
                    color: "white",
                  }}
                >
                  Турниры
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-oswald), sans-serif",
                    fontSize: `${Math.max(20, layout.tournaments.height / 2.2)}px`,
                    fontWeight: 600,
                    color: "white",
                    lineHeight: 1,
                  }}
                >
                  {stats.tournaments}
                </div>
              </Resizable>
            </div>
          </Draggable>
        )}

        {/* Draggable & Resizable Photos Badge */}
        {!layout.photos.hidden && (
          <Draggable
            disabled={!isEditing}
            position={{ x: layout.photos.x, y: layout.photos.y }}
            onDrag={handleDrag("photos")}
            onStop={handleDragStop}
            nodeRef={photosRef}
            bounds="parent"
          >
            <div
              ref={photosRef}
              className="absolute"
              style={{ top: 0, left: 0, cursor: isEditing ? "move" : "default" }}
            >
              <Resizable
                size={{ width: layout.photos.width, height: layout.photos.height }}
                onResizeStop={handleResize("photos")}
                enable={isEditing ? undefined : false}
                handleStyles={isEditing ? {
                  bottomRight: { ...resizeHandleStyle, width: 10, height: 10, right: -5, bottom: -5 },
                } : {}}
                style={{
                  border: isEditing ? editBorder : "4px solid white",
                  borderRadius: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isEditing && <DeleteButton elementKey="photos" />}
                {isEditing && <SizeIndicator width={layout.photos.width} height={layout.photos.height} />}
                <div
                  style={{
                    fontFamily: "var(--font-oswald), sans-serif",
                    fontSize: `${Math.max(12, layout.photos.height / 5)}px`,
                    color: "white",
                  }}
                >
                  Фото
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-oswald), sans-serif",
                    fontSize: `${Math.max(20, layout.photos.height / 2.2)}px`,
                    fontWeight: 600,
                    color: "white",
                    lineHeight: 1,
                  }}
                >
                  {stats.photosCount}
                </div>
              </Resizable>
            </div>
          </Draggable>
        )}

        {/* Draggable & Resizable Galleries Badge */}
        {!layout.galleries.hidden && (
          <Draggable
            disabled={!isEditing}
            position={{ x: layout.galleries.x, y: layout.galleries.y }}
            onDrag={handleDrag("galleries")}
            onStop={handleDragStop}
            nodeRef={galleriesRef}
            bounds="parent"
          >
            <div
              ref={galleriesRef}
              className="absolute"
              style={{ top: 0, left: 0, cursor: isEditing ? "move" : "default" }}
            >
              <Resizable
                size={{ width: layout.galleries.width, height: layout.galleries.height }}
                onResizeStop={handleResize("galleries")}
                enable={isEditing ? undefined : false}
                handleStyles={isEditing ? {
                  bottomRight: { ...resizeHandleStyle, width: 10, height: 10, right: -5, bottom: -5 },
                } : {}}
                style={{
                  border: isEditing ? editBorder : "4px solid white",
                  borderRadius: "24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isEditing && <DeleteButton elementKey="galleries" />}
                {isEditing && <SizeIndicator width={layout.galleries.width} height={layout.galleries.height} />}
                <div
                  style={{
                    fontFamily: "var(--font-oswald), sans-serif",
                    fontSize: `${Math.max(12, layout.galleries.height / 5)}px`,
                    color: "white",
                  }}
                >
                  Галереи
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-oswald), sans-serif",
                    fontSize: `${Math.max(20, layout.galleries.height / 2.2)}px`,
                    fontWeight: 600,
                    color: "white",
                    lineHeight: 1,
                  }}
                >
                  {stats.galleriesCount}
                </div>
              </Resizable>
            </div>
          </Draggable>
        )}
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
