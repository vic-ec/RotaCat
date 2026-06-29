import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CATEGORY_LABELS = {
  MO: 'Medical Officer',
  COSMO: 'COSMO',
  Registrar: 'Registrar',
  COSMOPsych: 'COSMO Psych',
  Consultant: 'Consultant'
}

const CONTRACT_LABELS = {
  full: 'Full-time',
  five_eighths: '⅝ contract',
  psych_overtime: 'Psych overtime'
}

export default function StaffListPage() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStaff()
  }, [])

  async function loadStaff() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('staff_reference')
      .select('*')
      .order('category', { ascending: true })
      .order('surname', { ascending: true })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setStaff(data)
    setLoading(false)
  }

  // Group staff by category for display
  const grouped = staff.reduce((acc, person) => {
    const key = person.category
    if (!acc[key]) acc[key] = []
    acc[key].push(person)
    return acc
  }, {})

  const categoryOrder = ['MO', 'Registrar', 'COSMO', 'COSMOPsych', 'Consultant']

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Staff</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {staff.length} staff members on record
          </p>
        </div>
      </div>

      {loading && <p className="text-sm text-ink-muted">Loading staff…</p>}

      {error && (
        <div className="card mb-4 border-flagRed bg-flagRed-bg p-4">
          <p className="text-sm text-flagRed">Couldn't load staff: {error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {categoryOrder
            .filter((cat) => grouped[cat]?.length)
            .map((cat) => (
              <div key={cat}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {CATEGORY_LABELS[cat]} ({grouped[cat].length})
                </h2>
                <div className="card divide-y divide-slate-line overflow-hidden">
                  {grouped[cat].map((person) => (
                    <div key={person.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: person.color_code }}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {person.name ? `${person.name} ` : ''}{person.surname}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {CONTRACT_LABELS[person.contract_type]} ·{' '}
                            {person.min_hours}–{person.max_hours}h/month
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {person.weekend_day_saturday_only && (
                          <span className="rounded bg-flagAmber-bg px-2 py-0.5 text-[11px] font-medium text-flagAmber">
                            Sat only
                          </span>
                        )}
                        {person.no_weekend_nights && (
                          <span className="rounded bg-canvas-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                            No WE nights
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
