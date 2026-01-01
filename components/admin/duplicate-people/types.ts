export interface DuplicatePerson {
  id: string
  real_name: string
  avatar_url: string | null
  photo_count: number
  gmail: string | null
  telegram_nickname: string | null
  telegram_profile_url: string | null
  facebook_profile_url: string | null
  instagram_profile_url: string | null
}

export interface DuplicateGroup {
  matchField: string
  matchValue: string
  people: DuplicatePerson[]
}

export interface DuplicatePeopleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}
