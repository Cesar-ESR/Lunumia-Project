export type ReceiptImageErrorCode =
  | 'pdf_invalid'
  | 'pdf_protected'
  | 'pdf_page_limit'
  | 'unsupported_type'
  | 'file_too_large'
  | 'empty_file'
  | 'read_failed'
  | 'decode_failed'
  | 'compression_failed'

const messages: Record<ReceiptImageErrorCode, string> = {
  pdf_invalid: 'PDF inválido o corrupto. Intenta con otro archivo.',
  pdf_protected:
    'PDF protegido o no compatible. Selecciona un PDF sin contraseña.',
  pdf_page_limit: 'Sólo se admiten comprobantes PDF de una página.',
  unsupported_type: 'Selecciona una imagen JPEG, PNG o un PDF de una página.',
  file_too_large: 'El archivo debe pesar menos de 10 MB.',
  empty_file: 'La imagen seleccionada está vacía.',
  read_failed: 'No se pudo leer la imagen. Intenta con otro archivo.',
  decode_failed: 'No se pudo abrir la imagen. Intenta con otro archivo.',
  compression_failed: 'No se pudo comprimir la imagen. Intenta nuevamente.',
}

export class ReceiptImageError extends Error {
  constructor(
    public readonly code: ReceiptImageErrorCode,
    options?: ErrorOptions,
  ) {
    super(messages[code], options)
    this.name = 'ReceiptImageError'
  }
}
