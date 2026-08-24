import type { ChangeEventHandler } from 'react'
import { FormField } from './FormField'

export function MoneyField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  optional,
  disabled,
  readOnly,
  placeholder = '0.00',
  allowNegative = false,
}: {
  id: string
  label: string
  value: string
  onChange: ChangeEventHandler<HTMLInputElement>
  error?: string
  hint?: string
  required?: boolean
  optional?: boolean
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  allowNegative?: boolean
}) {
  return (
    <FormField
      id={id}
      label={label}
      error={error}
      hint={hint}
      required={required}
      optional={optional}
      disabled={disabled}
      readOnly={readOnly}
    >
      <div className="ln-money-field">
        <span className="ln-money-field__prefix" aria-hidden="true">
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode={allowNegative ? 'text' : 'decimal'}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          readOnly={readOnly}
          aria-describedby={
            [hint ? `${id}-hint` : '', error ? `${id}-error` : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
          aria-invalid={error ? true : undefined}
          aria-label={`${label} en pesos mexicanos`}
        />
        <span className="ln-money-field__currency" aria-hidden="true">
          MXN
        </span>
      </div>
    </FormField>
  )
}
