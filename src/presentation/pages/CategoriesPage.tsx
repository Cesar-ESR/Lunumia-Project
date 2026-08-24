import { useCallback, useState, type FormEvent } from 'react'
import { createCategorySchema } from '@application/contracts'
import type { Category } from '@domain/entities'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { FormField } from '../components/FormField'
import { LoadingState } from '../components/LoadingState'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { Surface } from '../components/Surface'
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
        description="Organiza tus gastos por nombre. El color y el icono son apoyos visuales; el nombre siempre identifica la categoría."
      />
      {notice ? <Notice tone="error" message={notice} /> : null}
      <div className="ln-management-layout">
        <Surface className="ln-management-form">
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
            <FormField
              id="category-color"
              label="Color decorativo"
              error={errors.color}
              hint="La categoría seguirá identificándose por su nombre."
            >
              <input
                id="category-color"
                type="color"
                value={form.color}
                aria-describedby={
                  errors.color
                    ? 'category-color-hint category-color-error'
                    : 'category-color-hint'
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
                <Button
                  variant="secondary"
                  disabled={isPending}
                  onClick={resetForm}
                >
                  Cancelar
                </Button>
              ) : null}
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? 'Guardando…'
                  : editing
                    ? 'Guardar cambios'
                    : 'Crear categoría'}
              </Button>
            </div>
          </form>
        </Surface>
        <section aria-labelledby="category-list-title">
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
            <div className="ln-management-list">
              {categories.data.map((category) => (
                <Surface
                  as="article"
                  className="ln-management-row"
                  key={category.id}
                  aria-label={`Categoría ${category.name}`}
                >
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
                          ? 'Lunumia protege esta categoría para conservar movimientos sin clasificar.'
                          : 'Categoría personal editable.'}
                      </p>
                    </div>
                  </div>
                  {category.isSystem ? (
                    <span className="ln-status-label">Protegida</span>
                  ) : (
                    <div className="ln-management-actions">
                      <Button
                        variant="ghost"
                        onClick={() => beginEdit(category)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => void requestDelete(category)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  )}
                </Surface>
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
            ? deletion.expenseCount === 1
              ? `1 gasto usa “${deletion.category.name}”. Se reasignará a “Sin categoría” antes de eliminarla.`
              : `${deletion.expenseCount} gastos usan “${deletion.category.name}”. Se reasignarán a “Sin categoría” antes de eliminarla.`
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
