# Project Rules

## Product

Aplicación de presupuestos personales local-first para web y Android.

## Stack obligatorio

- React
- TypeScript
- Vite
- Supabase
- Dexie e IndexedDB
- Zod
- Vitest
- React Testing Library
- vite-plugin-pwa
- Capacitor para Android
- CSS Modules o Tailwind, pero no ambos

## Architecture

- Separar dominio, persistencia, sincronización e interfaz.
- La lógica financiera no debe depender de React.
- Usar repositorios para acceder a IndexedDB y Supabase.
- Validar entradas y respuestas externas con Zod.
- Usar UUID para identificadores.
- Los importes monetarios se almacenan como enteros en centavos.
- Las fechas introducidas por la persona usuaria usan `DateOnly` (`YYYY-MM-DD`), sin zona horaria. Los timestamps técnicos usan `Instant` UTC en ISO 8601.
- IndexedDB es la base local.
- Supabase es la fuente remota por usuario.
- La sincronización utiliza last-write-wins en el MVP.

## Restrictions

- No implementar conexión bancaria.
- No implementar aplicación iOS.
- No publicar inicialmente en Google Play.
- No agregar colaboración entre usuarios.
- No crear un asistente financiero conversacional abierto.
- No agregar dependencias sin justificar su necesidad.
- No refactorizar archivos ajenos a la tarea actual.
- No implementar funcionalidades futuras.
- No guardar claves secretas en el frontend.
- El OCR y la IA deben ejecutarse mediante funciones seguras del backend.

## Quality

- Cada cálculo financiero debe tener pruebas unitarias.
- Las operaciones críticas deben tener criterios de aceptación.
- Ejecutar pruebas, lint y build al finalizar cada tarea.
- Mantener accesibilidad y diseño responsive.
