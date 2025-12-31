export interface Statistics {
  players: {
    total: number
    with_verified: number
    without_verified: number
    without_verified_list: Array<{ id: string; name: string }>
  }
  faces: {
    total: number
    verified: number
    unverified: number
  }
  images: {
    total: number
    recognized: number
    with_1_person: number
    with_2_3_persons: number
    with_4_plus_persons: number
  }
  player_stats: {
    avg_photos: number
    min_photos: number
    max_photos: number
  }
  gallery_stats: {
    avg_photos: number
    min_photos: number
    max_photos: number
  }
  attention: {
    few_photos_count: number
    few_photos_list: Array<{ id: string; name: string; count: number }>
    no_avatar_count: number
    no_avatar_list: Array<{ id: string; name: string }>
    unknown_faces: number
  }
  top_players: Array<{ id: string; name: string; count: number }>
  galleries: {
    total: number
    fully_verified: number
    fully_verified_list: Array<{ id: string; title: string; date: string; photos: number; facesVerified: number }>
    fully_recognized: number
    fully_recognized_list: Array<{
      id: string
      title: string
      date: string
      photos: number
      facesVerified: number
      facesUnverified: number
    }>
    fully_processed: number
    fully_processed_list: Array<{
      id: string
      title: string
      date: string
      photos: number
      facesVerified: number
      facesUnverified: number
      facesUnknown: number
    }>
    partially_verified: number
    partially_verified_list: Array<{
      id: string
      title: string
      date: string
      processed: number
      total: number
      facesVerified: number
      facesUnverified: number
      facesUnknown: number
    }>
    not_processed: number
    not_processed_list: Array<{ id: string; title: string; date: string; photos: number }>
  }
  integrity: {
    inconsistent_verified: number
    orphaned_descriptors: number
    avg_unverified_confidence: number
  }
  distribution: Array<{
    threshold: number
    count: number
    percentage: number
  }>
  histogram: Array<{
    range: string
    count: number
    total_faces: number
  }>
}
