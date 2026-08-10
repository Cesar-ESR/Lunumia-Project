export function Notice({
  message,
  tone = 'success',
}: {
  message: string
  tone?: 'success' | 'error'
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {message}
    </div>
  )
}
