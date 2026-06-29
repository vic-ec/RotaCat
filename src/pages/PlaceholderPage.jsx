export default function PlaceholderPage({ title, description }) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl text-ink">{title}</h1>
      <div className="card mt-6 p-8 text-center">
        <p className="text-sm text-ink-muted">
          {description || 'This screen will be built in a later phase.'}
        </p>
      </div>
    </div>
  )
}
