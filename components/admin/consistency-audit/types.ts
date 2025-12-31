export interface ConsistencyAuditResult {
  person_id: string
  person_name: string
  photo_count: number
  descriptor_count: number
  outlier_count: number
  excluded_count?: number
  overall_consistency: number
  has_problems: boolean
}

export interface AuditSummary {
  total_people: number
  people_with_problems: number
  total_outliers: number
  total_excluded: number
}
