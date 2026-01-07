/**
 * Gallery Detail Page
 *
 * @migrated 2025-12-27 - Uses apiFetch (FastAPI) instead of direct Supabase
 */

import { apiFetch } from "@/lib/apiClient"
import { notFound } from "next/navigation"
import { GalleryView } from "@/components/gallery-view"
import type { Gallery, GalleryImage } from "@/lib/types"
import type { Metadata } from "next"

// Force dynamic rendering - don't try to fetch during build
export const dynamic = "force-dynamic"
export const revalidate = 60

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ photo?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params
  const { photo } = await searchParams

  const result = await apiFetch(`/api/galleries/${id}?full=true`)

  if (!result.success || !result.data) {
    return { title: "Галерея не найдена" }
  }

  const gallery = result.data as Gallery
  const images = gallery.gallery_images || []

  // Find specific photo if slug provided
  let ogImage = gallery.cover_image_url
  let title = gallery.title

  if (photo && images.length > 0) {
    const photoData = images.find((img: GalleryImage) => img.slug === photo)
    if (photoData?.image_url) {
      ogImage = photoData.image_url
      title = `${gallery.title} - Фото`
    }
  }

  const description = gallery.description || `Фотографии с ${gallery.title}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : [],
    },
  }
}

export default async function GalleryPage({ params }: Props) {
  const { id } = await params

  // Fetch gallery with images and people from FastAPI
  // full=true returns gallery_images with people array
  const result = await apiFetch(`/api/galleries/${id}?full=true`)

  if (!result.success || !result.data) {
    notFound()
  }

  return <GalleryView gallery={result.data as Gallery} />
}
