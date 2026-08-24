export function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  return (
    <a className="ln-skip-link" href={`#${targetId}`}>
      Ir al contenido principal
    </a>
  )
}
