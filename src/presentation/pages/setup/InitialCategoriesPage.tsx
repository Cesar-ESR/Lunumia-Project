import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { createCategorySchema } from '@application/contracts'
import { STARTER_CATEGORY_TEMPLATES } from '@application/use-cases/categories/starter-category-templates'
import type { Category } from '@domain/entities'
import { normalizeCategoryName } from '@domain/rules'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { ErrorState } from '../../components/ErrorState'
import { FormField } from '../../components/FormField'
import { LoadingState } from '../../components/LoadingState'
import { Notice } from '../../components/Notice'
import { useApplicationServices } from '../../context/ApplicationServicesContext'
import { useAuth } from '../../context/AuthContext'
import { useSync } from '../../context/SyncContext'
import { useAsyncData } from '../../hooks/useAsyncData'
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard'
import { friendlyError, zodFieldErrors } from '../../utils/forms'
import { readInternalDestination } from '../../utils/first-time'
import { SetupPageLayout } from './SetupPageLayout'

type ExistingCategoryDraft = {
  kind: 'existing'
  key: string
  category: Category
  name: string
  selected: boolean
}

type NewCategoryDraft = {
  kind: 'new'
  key: string
  name: string
  selected: boolean
}

type CategoryDraft = ExistingCategoryDraft | NewCategoryDraft

const starterOrder = new Map(
  STARTER_CATEGORY_TEMPLATES.map((template, index) => [
    normalizeCategoryName(template.name),
    index,
  ]),
)
const defaultCategoryColor = STARTER_CATEGORY_TEMPLATES[0]!.color

function orderForOnboarding(categories: Category[]): Category[] {
  return [...categories].sort((left, right) => {
    const leftOrder = starterOrder.get(left.normalizedName)
    const rightOrder = starterOrder.get(right.normalizedName)
    if (leftOrder !== undefined || rightOrder !== undefined) {
      if (leftOrder === undefined) return 1
      if (rightOrder === undefined) return -1
      return leftOrder - rightOrder
    }
    return (
      left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }) ||
      left.id.localeCompare(right.id)
    )
  })
}

function createDraft(categories: Category[]): CategoryDraft[] {
  return orderForOnboarding(
    categories.filter((category) => !category.isSystem),
  ).map((category) => ({
    kind: 'existing',
    key: category.id,
    category,
    name: category.name,
    selected: true,
  }))
}

export function InitialCategoriesPage() {
  const services = useApplicationServices()
  const auth = useAuth()
  const sync = useSync()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = readInternalDestination(location.state)
  const load = useCallback(
    () => services.categories.listCategories.execute(),
    [services],
  )
  const categories = useAsyncData(load)
  const refreshCategories = categories.refresh
  const loadedBaseline = useMemo(
    () =>
      orderForOnboarding(
        (categories.data ?? []).filter((category) => !category.isSystem),
      ),
    [categories.data],
  )
  const [baselineOverride, setBaselineOverride] = useState<Category[] | null>(
    null,
  )
  const [draftOverride, setDraftOverride] = useState<CategoryDraft[] | null>(
    null,
  )
  const baseline = baselineOverride ?? loadedBaseline
  const draft = useMemo(
    () => draftOverride ?? createDraft(baseline),
    [baseline, draftOverride],
  )
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const nextCustomId = useRef(0)
  const editInput = useRef<HTMLInputElement | null>(null)
  const previousSyncing = useRef(sync.isSyncing)

  const hydrate = useCallback((values: Category[]) => {
    const ordinary = orderForOnboarding(
      values.filter((category) => !category.isSystem),
    )
    setBaselineOverride(ordinary)
    setDraftOverride(createDraft(ordinary))
    setEditingKey(null)
    setFieldErrors({})
  }, [])

  const dirty = useMemo(() => {
    if (draft.some((item) => item.kind === 'new')) return true
    if (draft.length !== baseline.length) return true
    return draft.some((item) => {
      if (item.kind === 'new') return true
      const original = baseline.find((category) => category.id === item.key)
      return !original || !item.selected || item.name !== original.name
    })
  }, [baseline, draft])

  useEffect(() => {
    const syncJustFinished = previousSyncing.current && !sync.isSyncing
    previousSyncing.current = sync.isSyncing
    if (syncJustFinished && !dirty) refreshCategories()
  }, [dirty, refreshCategories, sync.isSyncing])

  useEffect(() => {
    if (!editingKey) return
    editInput.current?.focus()
    editInput.current?.select()
  }, [editingKey])

  const { guardDialog } = useUnsavedChangesGuard({ dirty, pending })

  const updateDraft = (
    key: string,
    update: (item: CategoryDraft) => CategoryDraft,
  ) => {
    setDraftOverride((current) =>
      (current ?? createDraft(baseline)).map((item) =>
        item.key === key ? update(item) : item,
      ),
    )
    setFieldErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
    setNotice(null)
  }

  const addCategory = () => {
    const key = `new-category-${++nextCustomId.current}`
    setDraftOverride((current) => [
      ...(current ?? createDraft(baseline)),
      { kind: 'new', key, name: '', selected: true },
    ])
    setEditingKey(key)
    setNotice(null)
  }

  const removeNewCategory = (key: string) => {
    setDraftOverride((current) =>
      (current ?? createDraft(baseline)).filter((item) => item.key !== key),
    )
    setEditingKey((current) => (current === key ? null : current))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const validateDraft = () => {
    const errors: Record<string, string> = {}
    const normalizedNames = new Map<string, string>()
    const validatedNames = new Map<string, string>()

    for (const item of draft.filter((candidate) => candidate.selected)) {
      const source =
        item.kind === 'existing'
          ? item.category
          : { color: defaultCategoryColor, icon: null }
      const parsed = createCategorySchema.safeParse({
        ownerId: services.ownerId,
        name: item.name,
        color: source.color,
        icon: source.icon,
      })
      if (!parsed.success) {
        errors[item.key] =
          zodFieldErrors(parsed.error).name ??
          'Revisa el nombre de la categoría.'
        continue
      }
      const normalized = normalizeCategoryName(parsed.data.name)
      const duplicateKey = normalizedNames.get(normalized)
      if (duplicateKey) {
        errors[item.key] = 'Ya existe una categoría con ese nombre.'
        errors[duplicateKey] = 'Ya existe una categoría con ese nombre.'
      } else normalizedNames.set(normalized, item.key)
      validatedNames.set(item.key, parsed.data.name)
    }

    setFieldErrors(errors)
    const firstError = Object.keys(errors)[0]
    if (firstError) setEditingKey(firstError)
    return { valid: Object.keys(errors).length === 0, validatedNames }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    const validation = validateDraft()
    if (!validation.valid) return

    setPending(true)
    setNotice(null)
    try {
      for (const item of draft) {
        if (item.kind === 'existing' && !item.selected)
          await services.categories.deleteCategory.execute(item.category.id)
      }
      for (const item of draft) {
        if (
          item.kind === 'existing' &&
          item.selected &&
          validation.validatedNames.get(item.key) !== item.category.name
        ) {
          await services.categories.updateCategory.execute(item.category.id, {
            ownerId: services.ownerId,
            name: validation.validatedNames.get(item.key),
            color: item.category.color,
            icon: item.category.icon,
          })
        }
      }
      for (const item of draft) {
        if (item.kind === 'new' && item.selected)
          await services.categories.createCategory.execute({
            ownerId: services.ownerId,
            name: validation.validatedNames.get(item.key),
            color: defaultCategoryColor,
            icon: null,
          })
      }
      navigate('/saldo/inicial', { state: { from: destination } })
    } catch (reason) {
      const failure = friendlyError(reason)
      try {
        const persisted = await services.categories.listCategories.execute()
        hydrate(persisted)
        setNotice(
          `${failure} Recargamos tus categorías para que puedas intentarlo de nuevo.`,
        )
      } catch {
        setNotice(`${failure} Vuelve a intentarlo antes de continuar.`)
      }
    } finally {
      setPending(false)
    }
  }

  const selectedCount = draft.filter((item) => item.selected).length
  const preparingSyncedCategories =
    Boolean(auth.user) &&
    sync.isSyncing &&
    categories.status === 'success' &&
    draft.length === 0

  return (
    <>
      <SetupPageLayout step="Paso 3 de 4" wide>
        <section className="ln-setup-card" aria-labelledby="categories-title">
          <header>
            <p className="eyebrow">Primera configuración</p>
            <h1 id="categories-title" tabIndex={-1}>
              Organiza tus gastos
            </h1>
            <p>
              Te sugerimos algunas categorías para comenzar. Ajusta las que te
              sirvan; podrás cambiarlas después.
            </p>
          </header>

          {notice ? (
            <Notice
              tone="danger"
              title="No pudimos guardar todas tus categorías"
              message={notice}
            />
          ) : null}

          {categories.status === 'loading' && !categories.data ? (
            <LoadingState message="Preparando tus categorías…" />
          ) : categories.status === 'error' ? (
            <ErrorState
              title="No pudimos cargar tus categorías"
              message={categories.error.message}
              onRetry={refreshCategories}
            />
          ) : preparingSyncedCategories ? (
            <LoadingState message="Preparando tus categorías…" />
          ) : (
            <form
              className="ln-category-setup"
              noValidate
              onSubmit={(event) => void submit(event)}
            >
              <ul
                className="ln-category-setup__list"
                aria-label="Categorías para organizar tus gastos"
              >
                {draft.map((item) => {
                  const editing = editingKey === item.key
                  const displayName = item.name.trim() || 'Nueva categoría'
                  return (
                    <li
                      className={`ln-category-setup__item${
                        item.selected ? '' : ' ln-category-setup__item--removed'
                      }`}
                      key={item.key}
                    >
                      <div className="ln-category-setup__row">
                        <label className="ln-category-setup__choice">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            disabled={pending}
                            onChange={(event) => {
                              const selected = event.target.checked
                              updateDraft(item.key, (current) => ({
                                ...current,
                                selected,
                              }))
                              if (!selected && editingKey === item.key)
                                setEditingKey(null)
                            }}
                          />
                          <span>{displayName}</span>
                        </label>
                        <div className="ln-category-setup__item-actions">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={!item.selected || pending}
                            aria-expanded={editing}
                            aria-controls={`category-editor-${item.key}`}
                            onClick={() =>
                              setEditingKey(editing ? null : item.key)
                            }
                          >
                            {editing ? 'Listo' : 'Editar'}
                          </Button>
                          {item.kind === 'new' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => removeNewCategory(item.key)}
                            >
                              Quitar
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {editing ? (
                        <div
                          className="ln-category-setup__editor"
                          id={`category-editor-${item.key}`}
                        >
                          <FormField
                            id={`category-name-${item.key}`}
                            label={`Nombre de ${displayName}`}
                            error={fieldErrors[item.key]}
                          >
                            <input
                              ref={editInput}
                              id={`category-name-${item.key}`}
                              value={item.name}
                              maxLength={80}
                              disabled={pending}
                              onChange={(event) =>
                                updateDraft(item.key, (current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                            />
                          </FormField>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>

              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={addCategory}
              >
                Agregar categoría
              </Button>

              {selectedCount === 0 ? (
                <Notice
                  tone="info"
                  message="Podrás crear categorías después desde Organización."
                />
              ) : null}

              <div className="ln-setup-actions">
                <Button
                  type="submit"
                  loading={pending}
                  loadingLabel="Guardando categorías…"
                >
                  Continuar
                </Button>
              </div>
            </form>
          )}
        </section>
      </SetupPageLayout>
      {guardDialog}
    </>
  )
}
