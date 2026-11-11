# Reglas de Proyecto y Directrices para Agentes (Lunumia / GastoClaro)

Este archivo define las reglas de arquitectura, flujo de trabajo y validaciones obligatorias para el desarrollo en **Lunumia**, reutilizando las mejores prácticas y configuración probada en Codex.

---

## 1. Stack Tecnológico Obligatorio
- **Frontend Core**: React 19, TypeScript (modo estricto con `exactOptionalPropertyTypes`), Vite.
- **Base de Datos Local (Offline-First)**: Dexie 4 e IndexedDB.
- **Backend & Auth**: Supabase (PostgreSQL 14+, Row Level Security, Edge Functions en Deno).
- **Móvil**: Capacitor 8 (`@capacitor/android`, `@capacitor/camera`, etc.).
- **Contratos & Tipado**: Zod.
- **Testing**: Vitest, React Testing Library, fake-indexeddb, Fast-Check (Property-Based Testing).

---

## 2. Invariantes de Arquitectura (Clean Architecture)
- **Separación de Capas**:
  - `src/domain/`: Reglas de negocio e invariantes contables. **Cero dependencias** de React, Dexie o Supabase.
  - `src/application/`: Casos de uso y servicios de orquestación (`SyncCoordinator`, `SyncOrchestrator`, etc.).
  - `src/infrastructure/`: Implementaciones concretas de repositorios (Dexie, Supabase, APIs de plataforma).
  - `src/presentation/`: Vistas, hooks, contextos y diseño visual en React.
- **Invariantes Financieros**:
  - Todos los montos se representan y almacenan como **enteros positivos en centavos (`AmountCents`)**. Jamás usar números decimales flotantes para dinero.
  - Fechas de usuario usan `DateOnly` (`YYYY-MM-DD`). Timestamps técnicos usan `Instant` UTC ISO 8601.
- **Límites de Alcance**:
  - No modificar `src/domain` o `src/application` al realizar tareas puramente de presentación o UI, a menos que el requerimiento lo exija explícitamente.
  - No guardar claves secretas (`service_role`, `GROQ_API_KEY`) en el frontend ni en variables `VITE_*`.

---

## 3. Protocolo de Validación Obligatorio (Reglas de Codex)
Antes de dar por concluida cualquier modificación o tarea, es mandatorio ejecutar la suite de verificación local:

```bash
pnpm run typecheck   # Verificación estricta de TypeScript
pnpm run test:run    # Suite completa de tests unitarios y de integración
pnpm run lint        # Linter ESLint
```

Para formateo de código:
```bash
pnpm run format:check
pnpm run format
```

---

## 4. Habilidades Especializadas Disponibles (Skills)
El proyecto cuenta con las skills importadas de Codex en `.agents/skills/`:
- **`supabase`** (`.agents/skills/supabase/SKILL.md`): Protocolo oficial de seguridad en Auth, RLS con `TO authenticated` + `auth.uid() = user_id`, Edge Functions y manejo de migraciones con `supabase migration new`.
- **`supabase-postgres-best-practices`** (`.agents/skills/supabase-postgres-best-practices/SKILL.md`): Guía exhaustiva de 32 patrones para diseño de índices GiST/B-tree, prevención de deadlocks, advisory locks y optimización de RLS.
- **`github-publish`** (`.agents/skills/github-publish/SKILL.md`): Flujo de trabajo para push de ramas, commits intencionales y apertura/actualización de Pull Requests (antes llamada `yeet` en Codex).
- **`gh-fix-ci`** (`.agents/skills/gh-fix-ci/SKILL.md`): Diagnóstico y resolución de checks fallidos en GitHub Actions (`ci.yml`, `deploy-web.yml`).
- **`gh-address-comments`** (`.agents/skills/gh-address-comments/SKILL.md`): Manejo e implementación de cambios solicitados en code reviews de PRs.
- **`github`** (`.agents/skills/github/SKILL.md`): Triaje general de repositorio, issues y estado de PRs.
