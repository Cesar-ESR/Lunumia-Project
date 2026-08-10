import { useCallback, useState, type FormEvent } from 'react'
import { createCategorySchema } from '@application/contracts'
import type { Category } from '@domain/entities'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { FormField } from '../components/FormField'
import { LoadingState } from '../components/LoadingState'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { friendlyError, zodFieldErrors, type FieldErrors } from '../utils/forms'

const emptyForm = { name: '', color: '#2f6fed', icon: '' }

export function CategoriesPage() {
  const services = useApplicationServices()
  const load = useCallback(
    () => services.categories.listCategories.execute(),
    [services],
  )
  const categories = useAsyncData(load)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<Category | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [deletion, setDeletion] = useState<{
    category: Category
    expenseCount: number
  } | null>(null)

  const resetForm = () => {
    setForm(emptyForm)
    setEditing(null)
    setErrors({})
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const input = {
      ownerId: services.ownerId,
      name: form.name,
      color: form.color,
      icon: form.icon || null,
    }
    const parsed = createCategorySchema.safeParse(input)
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error))
      return
    }
    setIsPending(true)
    setNotice(null)
    try {
      if (editing)
        await services.categories.updateCategory.execute(
          editing.id,
          parsed.data,
        )
      else await services.categories.createCategory.execute(parsed.data)
      resetForm()
      categories.refresh()
    } catch (reason) {
      setNotice(friendlyError(reason))
    } finally {
      setIsPending(false)
    }
  }

  const beginEdit = (category: Category) => {
    setEditing(category)
    setForm({
      name: category.name,
      color: category.color,
      icon: category.icon ?? '',
    })
    setErrors({})
    setNotice(null)
  }

  const requestDelete = async (category: Category) => {
    setNotice(null)
    try {
      const expenseCount =
        await services.categories.countCategoryExpenses.execute(category.id)
      setDeletion({ category, expenseCount })
    } catch (reason) {
      setNotice(friendlyError(reason))
    }
  }

  const confirmDelete = async () => {
    if (!deletion) return
    setIsPending(true)
    try {
      await services.categories.deleteCategory.execute(deletion.category.id)
      if (editing?.id === deletion.category.id) resetForm()
      setDeletion(null)
      categories.refresh()
    } catch (reason) {
      setNotice(friendlyError(reason))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Organización"
        title="Categorías"
        description="Agrupa tus gastos de una forma que tenga sentido para ti."
      />
      {notice ? <Notice tone="error" message={notice} /> : null}
      <div className="split-layout">
        <section className="panel">
          <h2>{editing ? 'Editar categoría' : 'Nueva categoría'}</h2>
          <form className="stack-form" onSubmit={submit} noValidate>
            <FormField id="category-name" label="Nombre" error={errors.name}>
              <input
                id="category-name"
                value={form.name}
                maxLength={80}
                aria-describedby={
                  errors.name ? 'category-name-error' : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </FormField>
            <FormField id="category-color" label="Color" error={errors.color}>
              <input
                id="category-color"
                type="color"
                value={form.color}
                aria-describedby={
                  errors.color ? 'category-color-error' : undefined
                }
                onChange={(event) =>
                  setForm({ ...form, color: event.target.value })
                }
              />
            </FormField>
            <FormField
              id="category-icon"
              label="Icono (opcional)"
              error={errors.icon}
              hint="Puedes usar un emoji o una palabra corta."
            >
              <input
                id="category-icon"
                value={form.icon}
                maxLength={80}
                aria-describedby={
                  errors.icon ? 'category-icon-error' : 'category-icon-hint'
                }
                onChange={(event) =>
                  setForm({ ...form, icon: event.target.value })
                }
              />
            </FormField>
            <div className="form-actions">
              {editing ? (
                <button
                  type="button"
                  className="button ghost"
                  disabled={isPending}
                  onClick={resetForm}
                >
                  Cancelar
                </button>
              ) : null}
              <button className="button primary" disabled={isPending}>
                {isPending
                  ? 'Guardando…'
                  : editing
                    ? 'Guardar cambios'
                    : 'Crear categoría'}
              </button>
            </div>
          </form>
        </section>
        <section className="panel" aria-labelledby="category-list-title">
          <h2 id="category-list-title">Tus categorías</h2>
          {categories.status === 'loading' && !categories.data ? (
            <LoadingState message="Cargando categorías" />
          ) : null}
          {categories.status === 'error' ? (
            <ErrorState
              message={categories.error.message}
              onRetry={categories.refresh}
            />
          ) : null}
          {categories.data?.length === 0 ? (
            <EmptyState
              title="Aún no hay categorías"
              description="Crea la primera para organizar tus gastos."
            />
          ) : null}
          {categories.data?.length ? (
            <div className="record-list">
              {categories.data.map((category) => (
                <article className="record-card" key={category.id}>
                  <div className="record-main">
                    <span
                      className="category-swatch"
                      style={{ backgroundColor: category.color }}
                      aria-hidden="true"
                    />
                    <div>
                      <h3>
                        {category.icon ? `${category.icon} ` : ''}
                        {category.name}
                      </h3>
                      <p>
                        {category.isSystem
                          ? 'Categoría del sistema'
                          : 'Categoría personal'}
                      </p>
                    </div>
                  </div>
                  {category.isSystem ? (
                    <span className="badge">Protegida</span>
                  ) : (
                    <div className="record-actions">
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => beginEdit(category)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="button ghost danger-text"
                        onClick={() => void requestDelete(category)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(deletion)}
        title="Eliminar categoría"
        description={
          deletion
            ? `${deletion.expenseCount} gasto(s) usan “${deletion.category.name}”. Se reasignarán a “Sin categoría” antes de eliminarla.`
            : ''
        }
        confirmLabel="Eliminar categoría"
        isPending={isPending}
        onCancel={() => setDeletion(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
