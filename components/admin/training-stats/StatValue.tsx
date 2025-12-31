interface StatValueProps {
  label: string
  value: string | number
  color?: string
  small?: boolean
}

export function StatValue({ label, value, color = "text-foreground", small = false }: StatValueProps) {
  return (
    <div>
      <div className={`${small ? "text-lg" : "text-2xl"} font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
