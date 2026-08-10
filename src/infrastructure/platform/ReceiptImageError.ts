export type ReceiptImageErrorCode =
  | 'unsupported_type'
  | 'file_too_large'
  | 'empty_file'
  | 'read_failed'
  | 'decode_failed'
  | 'compression_failed'

const messages: Record<ReceiptImageErrorCode, string> = {
  unsupported_type: 'Selecciona una imagen JPEG o PNG.',
  file_too_large: 'La imagen debe pesar menos de 10 MB.',
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
