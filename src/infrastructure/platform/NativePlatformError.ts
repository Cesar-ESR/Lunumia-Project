export type NativePlatformErrorCode =
  | 'permission_denied'
  | 'camera_unavailable'
  | 'gallery_unavailable'
  | 'invalid_image'
  | 'platform_error'
  | 'network_listener_failed'
  | 'external_url_failed'

const messages: Record<NativePlatformErrorCode, string> = {
  permission_denied:
    'No tenemos permiso para usar la cámara. Puedes elegir una imagen de tu galería o registrar el gasto manualmente.',
  camera_unavailable:
    'La cámara no está disponible. Puedes elegir una imagen de tu galería o registrar el gasto manualmente.',
  gallery_unavailable:
    'No fue posible abrir la galería. Puedes registrar el gasto manualmente.',
  invalid_image: 'No se pudo abrir esta imagen. Elige otra fotografía.',
  platform_error: 'No fue posible completar la acción en este dispositivo.',
  network_listener_failed:
    'No fue posible consultar la conexión de este dispositivo.',
  external_url_failed: 'No fue posible abrir el enlace externo.',
}

export class NativePlatformError extends Error {
  constructor(
    public readonly code: NativePlatformErrorCode,
    options?: ErrorOptions,
  ) {
    super(messages[code], options)
    this.name = 'NativePlatformError'
  }
}
