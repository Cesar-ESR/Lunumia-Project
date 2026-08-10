import { PageHeader } from '../components/PageHeader'

export function PlaceholderPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <>
      <PageHeader eyebrow="Lunumia" title={title} description={description} />
      <section className="panel">
        <p>
          Esta sección se habilitará en el siguiente incremento de la Fase 1C.
        </p>
      </section>
    </>
  )
}
