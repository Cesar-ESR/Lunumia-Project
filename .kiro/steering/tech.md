# Tech Stack

Este documento es la referencia de tecnología y comandos del proyecto. Las decisiones funcionales y de arquitectura específicas de una entrega pertenecen a su spec.

## Language

- TypeScript `5.9` con modo `strict`

## Runtime

- Node.js `22.x` (requerido por Capacitor 8)

## Framework

- React `19.2.7`
- React Router

## Build System

- Vite `8.1`
- vite-plugin-pwa
- Capacitor para Android

## Dependencies

- Dexie e IndexedDB para persistencia local
- Supabase Auth, PostgreSQL `17` y Edge Functions
- Zod para validación de límites externos
- Vitest y React Testing Library para pruebas
- CSS Modules **o** Tailwind; nunca ambos

## Common Commands

```bash
# Build
npm run build

# Run (development)
npm run dev

# Test
npm run test:run

# Lint / Format
npm run lint
npm run typecheck
```

## Conventions

- Use consistent formatting (configure a formatter once the language is chosen)
- Pin dependency versions
- Keep secrets out of source control (use environment variables)
- No exponer secretos, service-role keys ni proveedores de OCR/IA en el frontend.
