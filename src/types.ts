export type StudentRecord = {
  roll?: number | string
  displayRoll?: string
  name?: string
  user?: string
}

export type LectureRow = {
  attendance_date: string
  time_slot: string
  students: StudentRecord[] | null
  synced_at: string
}

