import type { BoundingBox } from "./utils/geometry"

export interface Photographer {
  id: string
  name: string
  created_at: string
}

export interface Location {
  id: string
  name: string
  city_id?: string | null
  address?: string | null
  maps_url?: string | null
  website_url?: string | null
  created_at: string
}

export interface Organizer {
  id: string
  name: string
  created_at: string
}

export interface GalleryImage {
  id: string
  gallery_id: string
  image_url: string
  original_url: string
  original_filename: string
  file_size: number | null
  width: number | null
  height: number | null
  display_order: number
  download_count: number
  created_at: string
}

export interface Gallery {
  id: string
  title: string
  shoot_date: string
  gallery_url: string
  external_gallery_url: string | null
  cover_image_url: string
  cover_image_square_url: string | null
  photographer_id: string | null
  location_id: string | null
  organizer_id: string | null
  sort_order: string | null
  created_at: string
  updated_at: string
  photographers?: Photographer
  locations?: Location
  organizers?: Organizer
  gallery_images?: GalleryImage[]
  photo_count?: number
}

export interface User {
  id: string
  telegram_id: number
  username: string | null
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  person_id: string | null  // Link to people table (matched player)
  created_at: string
  updated_at: string
}

export interface TelegramAuthData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface Like {
  id: string
  user_id: string
  image_id: string
  created_at: string
  users?: User
}

export interface Comment {
  id: string
  gallery_image_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  users?: User
}

export interface Favorite {
  id: string
  user_id: string
  gallery_image_id: string
  created_at: string
  gallery_images?: GalleryImage
}

export interface Person {
  id: string
  real_name: string
  telegram_name: string | null
  telegram_nickname: string | null
  telegram_profile_url: string | null
  facebook_profile_url: string | null
  instagram_profile_url: string | null
  gmail: string | null
  paddle_ranking: number | null
  tournament_results: TournamentResult[]
  avatar_url: string | null
  show_in_players_gallery: boolean
  show_photos_in_galleries: boolean
  created_at: string
  updated_at: string
  _count?: {
    photo_faces: number
  }
}

export interface TournamentResult {
  tournament: string
  place: number
  date: string
}

export interface FaceDescriptor {
  id: string
  person_id: string
  descriptor: number[]
  source_image_id: string | null
  created_at: string
  people?: Person
}

export interface PhotoFace {
  id: string
  photo_id: string
  person_id: string | null
  insightface_bbox: BoundingBox
  confidence: number | null
  verified: boolean
  created_at: string
  updated_at: string
  people?: Person
  gallery_images?: GalleryImage
}

export interface DetectedFace {
  boundingBox: BoundingBox
  confidence: number
  blur_score?: number
  embedding: number[]
}

export interface UnknownFaceCluster {
  cluster_id: number
  faces: UnknownFace[]
  sample_photo_url: string
}

export interface UnknownFace {
  photo_id: string
  photo_url: string
  bbox: BoundingBox
  descriptor: number[]
}

export interface TaggedFace {
  id: string
  face: {
    boundingBox: BoundingBox
    confidence: number
    blur_score: number
    embedding: number[] | null
  }
  personId: string | null
  personName: string | null
  recognitionConfidence: number | null
  verified: boolean
}

export type { BoundingBox }
export type { Result } from "./types/result"
export { success, failure, isSuccess, isFailure } from "./types/result"
