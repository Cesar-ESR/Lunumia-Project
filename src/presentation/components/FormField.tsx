import { cloneElement, type ReactElement } from 'react'

interface FieldControlProps {
  id?: string
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

export function FormField({
  id,
  label,
  error,
  hint,
  required = false,
  optional = false,
  disabled = false,
  readOnly = false,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  required?: boolean
  optional?: boolean
  disabled?: boolean
  readOnly?: boolean
  children: ReactElement<FieldControlProps>
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = Array.from(
    new Set(
      [children.props['aria-describedby'], hintId, errorId]
        .filter(Boolean)
        .flatMap((value) => value?.split(' ') ?? []),
    ),
  ).join(' ')
  const control =
    children.props.id === id
      ? cloneElement(children, {
          required: required || children.props.required,
          disabled: disabled || children.props.disabled,
          readOnly: readOnly || children.props.readOnly,
          'aria-describedby': describedBy || undefined,
          'aria-invalid': error ? true : children.props['aria-invalid'],
        })
      : children

  return (
    <div
      className={`form-field ln-form-field${disabled ? ' ln-form-field--disabled' : ''}${readOnly ? ' ln-form-field--readonly' : ''}`}
    >
      <label className="ln-form-field__label" htmlFor={id}>
        {label}
        {required || optional ? (
          <span className="ln-form-field__context">
            {required ? '(Obligatorio)' : '(Opcional)'}
          </span>
        ) : null}
      </label>
      {control}
      {hint ? (
        <small id={hintId} className="ln-form-field__hint">
          {hint}
        </small>
      ) : null}
      {error ? (
        <small
          id={errorId}
          className="field-error ln-form-field__error"
          role="alert"
        >
          {error}
        </small>
      ) : null}
    </div>
  )
}
