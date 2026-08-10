# Implementation Plan: Lunumia

## Overview

Plan de implementación incremental para Lunumia organizado en 6 fases secuenciales con dependencias explícitas. Prioriza un MVP funcional offline antes de abordar autenticación, sincronización, OCR, IA y Android. Cada subtarea es independientemente ejecutable, produce un resultado verificable y no añade funcionalidad fuera de los requisitos aprobados.

**Lenguaje**: TypeScript (strict)
**Framework**: React + Vite
**Testing**: Vitest + fast-check + React Testing Library

## Tasks

- [x] 1. Fase 0 — Preparación del proyecto
  - **Objetivo**: Inicializar proyecto React+Vite+TypeScript strict con configuración de calidad, estructura de carpetas y CI mínimo.
  - **Dependencias**: Ninguna.
  - **Prioridad**: MVP obligatoria.
  - **Criterios de completitud**: `npm run build`, `npm run lint`, `npm run test` ejecutan sin errores. Estructura de carpetas creada. Variables de entorno configuradas.
  - **Tests mínimos**: Vitest ejecuta un test trivial de ejemplo.
  - **Archivos/módulos esperados**: `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.*`, `vitest.config.ts`, `.env.example`, `src/` con estructura base, `.github/workflows/ci.yml`.

  - [x] 1.1 Inicializar proyecto Vite + React + TypeScript strict
    - Crear proyecto con `npm create vite@latest` (React + TypeScript)
    - Configurar `tsconfig.json` con `strict: true`, `noUncheckedIndexedAccess: true`
    - Instalar dependencias core: `react`, `react-dom`, `react-router-dom`, `zod`, `uuid`, `dexie`
    - Instalar dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `fast-check`, `eslint`, `prettier`, `jsdom`, `fake-indexeddb`
    - Crear `.env.example` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
    - Configurar `vite.config.ts` con alias de paths (`@domain`, `@application`, `@infrastructure`, `@presentation`, `@shared`)
    - _Requirements: 36.1, 36.3, 38.4, 38.5_

  - [x] 1.2 Configurar ESLint, Prettier, Vitest y scripts de calidad
    - Configurar ESLint con reglas de TypeScript strict y React hooks
    - Configurar Prettier con formato consistente
    - Configurar `vitest.config.ts` con entorno `jsdom`, setup file con `fake-indexeddb` y `@testing-library/jest-dom`
    - Añadir scripts en `package.json`: `dev`, `build`, `preview`, `lint`, `lint:fix`, `test`, `test:run`, `typecheck`
    - Verificar que `npm run lint`, `npm run typecheck` y `npm run test:run` pasan sin error
    - _Requirements: 38.4, 38.5_

  - [x] 1.3 Crear estructura de carpetas y composition root vacío
    - Crear directorios: `src/domain/{entities,value-objects,calculations,rules,repositories,ports,errors}`, `src/application/{contracts,use-cases,services}`, `src/infrastructure/{local,remote,sync,auth,ocr,ai,backup,platform}`, `src/presentation/{pages,components,hooks,context,layouts}`, `src/shared/{utils}`, `src/app/`
    - Crear `src/app/composition-root.ts` vacío con comentario placeholder
    - Crear `src/shared/constants.ts` con constantes base (app name, schema version)
    - Crear archivo `src/main.tsx` y `src/App.tsx` mínimos con React Router
    - _Requirements: 36.1, 36.2, 36.3_

  - [x] 1.4 Configurar CI con GitHub Actions
    - Crear `.github/workflows/ci.yml` con jobs: install, lint, typecheck, test, build
    - Usar Node 22.x, cache de `node_modules`
    - Ejecutar en push a `main` y pull requests
    - _Requirements: 38.4_

- [x] 2. Fase 1A — Dominio: value objects, entidades y cálculos financieros
  - **Objetivo**: Implementar la capa de dominio pura con value objects, entidades, cálculos financieros y reglas de negocio. Sin dependencias externas (sin React, sin Dexie, sin Zod).
  - **Dependencias**: Tarea 1.
  - **Prioridad**: MVP obligatoria.
  - **Criterios de completitud**: Todos los cálculos financieros pasan tests unitarios y property-based tests. Reglas de negocio validadas.
  - **Tests mínimos**: Property tests P5, P6, P7, P8, P9, P10. Unit tests para generación de ocurrencias y reglas.
  - **Archivos/módulos esperados**: `src/domain/value-objects/`, `src/domain/entities/`, `src/domain/calculations/`, `src/domain/rules/`, `src/domain/repositories/`, `src/domain/ports/`, `src/domain/errors/`.

  - [x] 2.1 Implementar value objects y tipos de entidades
    - Crear `AmountCents.ts`, `SignedMoneyCents.ts` con funciones de validación (isAmountCents, isSignedMoney)
    - Crear `DateOnly.ts`, `Instant.ts` con funciones de creación y validación de formato
    - Crear interfaces de todas las entidades en `entities/`: Period, Income, Expense, Category, CategoryBudget, RecurringPayment, RecurringPaymentOccurrence, SyncOperation, UserSettings, DeviceSyncState
    - Crear tipos unión: PeriodType, Frequency, OccurrenceStatus, PaymentStatus, SyncStatus, SyncOperationType, SyncOperationStatus
    - Crear interfaz base `SyncableEntity`
    - Crear `errors/DomainError.ts`, `PeriodOverlapError.ts`, `CategoryDuplicateError.ts`, `OccurrenceAlreadyPaidError.ts`, `SystemCategoryProtectedError.ts`
    - Crear barrel exports (`index.ts`) en cada subcarpeta
    - _Requirements: 7.5, 39.1, 39.2_

  - [x] 2.2 Implementar cálculos financieros puros
    - Implementar `computeCurrentBalance` en `calculations/balance.ts`
    - Implementar `computeBudgetRemaining` y `computeBudgetUsagePercentage` en `calculations/budget.ts`
    - Implementar `computePendingCommitments` en `calculations/commitments.ts`
    - Implementar `computeRealAvailableMoney` en `calculations/balance.ts`
    - Implementar `computeSpendingPace` con tipo SpendingPace en `calculations/spending-pace.ts`
    - Implementar `simulatePurchaseImpact` con tipo SimulationResult en `calculations/simulator.ts`
    - Implementar `computeCategoryChangePercentage` en `calculations/category-changes.ts`
    - Manejar edge cases según tabla del diseño (presupuesto=0, sin ingresos, periodo futuro, etc.)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 14.1, 30.1_

  - [x]* 2.3 Escribir property tests para cálculos financieros (P5, P6, P7, P8, P9, P10)
    - **Property 5: Determinismo del saldo actual** — generar arrays de Income/Expense aleatorios, verificar computeCurrentBalance = sum(incomes) - sum(expenses) y recomputación idéntica
    - **Property 6: Presupuesto restante por categoría** — verificar budget.amount - sum(expenses filtrados)
    - **Property 7: Compromisos pendientes** — verificar suma de montos de ocurrencias pending dentro del periodo
    - **Property 8: Dinero disponible real** — verificar (sum ingresos - sum gastos) - compromisos pendientes
    - **Property 9: Ritmo de gasto con restricciones** — verificar indeterminate si presupuesto=0, timePercentage ∈ [0,100], pace=high si gasto > tiempo + 10
    - **Property 10: Impacto de simulación de compra** — verificar afterPurchase = current - amount, isNegative correcto
    - Mínimo 100 iteraciones por propiedad con fast-check
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.5, 9.1, 9.2, 9.3**

  - [x] 2.4 Implementar reglas de negocio y generación de ocurrencias
    - Implementar `period-overlap.ts`: función que detecta si dos periodos se solapan (startA <= endB AND startB <= endA)
    - Implementar `category-uniqueness.ts`: función que normaliza nombre (trim + toLowerCase) y compara
    - Implementar `occurrence-generation.ts`: algoritmo de generación de ocurrencias por frecuencia (weekly, biweekly, monthly) filtradas al rango del periodo. Manejar el caso de día 31 en meses cortos.
    - Crear interfaces de repositorio en `repositories/`: IPeriodRepository, IIncomeRepository, IExpenseRepository, ICategoryRepository, ICategoryBudgetRepository, IRecurringPaymentRepository, IRecurringPaymentOccurrenceRepository, ISyncOperationRepository
    - Crear interfaces de puertos en `ports/`: ReceiptRecognitionProvider, AIInsightsProvider
    - _Requirements: 1.3, 4.2, 6.2, 6.4_

  - [x]* 2.5 Escribir property tests para reglas y ocurrencias (P3, P11, P12, P13)
    - **Property 3: Rechazo de periodos solapados** — generar pares de periodos con fechas que se solapan y verificar rechazo
    - **Property 11: Atomicidad e idempotencia de pago de ocurrencia** — verificar que marcar como paid crea exactamente un gasto, reintentar es rechazado
    - **Property 12: Generación de ocurrencias dentro del periodo** — verificar que todos los dueDate generados caen dentro de [startDate, endDate]
    - **Property 13: Ocurrencia skipped no genera gasto** — verificar que transactionId es null para ocurrencias skipped
    - Mínimo 100 iteraciones por propiedad
    - **Validates: Requirements 1.3, 6.2, 6.3, 6.4, 6.6**

- [x] 3. Fase 1B — Persistencia local, esquemas Zod y casos de uso
  - **Objetivo**: Implementar repositorio Dexie, esquemas de validación Zod y casos de uso que orquestan dominio + persistencia.
  - **Dependencias**: Tarea 2.
  - **Prioridad**: MVP obligatoria.
  - **Criterios de completitud**: CRUD completo de todas las entidades funciona con IndexedDB (fake-indexeddb en tests). Validaciones Zod rechazan datos inválidos. Transacción atómica de pago recurrente funciona.
  - **Tests mínimos**: Property test P1 (round-trip), P2 (montos), P4 (unicidad categorías). Tests de integración de repositorios con fake-indexeddb.
  - **Archivos/módulos esperados**: `src/infrastructure/local/database.ts`, repositorios Dexie, `src/application/contracts/`, casos de uso.

  - [x] 3.1 Implementar base de datos Dexie y repositorios locales
    - Crear `infrastructure/local/database.ts` con esquema Dexie v1 (todas las tablas e índices compuestos)
    - Implementar `DexiePeriodRepository` con findOverlapping, findByDateRange
    - Implementar `DexieIncomeRepository` y `DexieExpenseRepository`
    - Implementar `DexieCategoryRepository` con findByNormalizedName, countExpensesByCategory
    - Implementar `DexieCategoryBudgetRepository` con upsert
    - Implementar `DexieRecurringPaymentRepository` y `DexieRecurringPaymentOccurrenceRepository`
    - Implementar `DexieSyncOperationRepository` con enqueue, dequeue, findPending
    - Todos los repositorios filtran por `ownerId` y excluyen `deletedAt !== null` en lecturas estándar
    - _Requirements: 11.1, 11.3, 36.2_

  - [x] 3.2 Implementar esquemas Zod y casos de uso CRUD
    - Crear esquemas Zod en `application/contracts/`: period.schema.ts, income.schema.ts, expense.schema.ts, category.schema.ts, category-budget.schema.ts, recurring-payment.schema.ts
    - Implementar casos de uso de periodos: CreatePeriod (valida solapamiento), ListPeriods, SetActivePeriod
    - Implementar casos de uso de ingresos: CreateIncome, UpdateIncome, DeleteIncome
    - Implementar casos de uso de gastos: CreateExpense, UpdateExpense, DeleteExpense
    - Implementar casos de uso de categorías: CreateCategory (valida unicidad), UpdateCategory, DeleteCategory (reasigna a "Sin categoría")
    - Implementar caso de uso de presupuestos: UpsertCategoryBudget, ListBudgetsByPeriod
    - Cada caso de uso valida input con Zod, verifica reglas de dominio y persiste atómicamente
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 14.2_

  - [x] 3.3 Implementar caso de uso de pagos recurrentes y operación atómica
    - Implementar CreateRecurringPayment, UpdateRecurringPayment, DeleteRecurringPayment, ToggleRecurringPaymentStatus
    - Implementar GenerateOccurrencesForPeriod: genera ocurrencias usando reglas de `occurrence-generation.ts`, verifica no-duplicados por (recurringPaymentId, dueDate)
    - Implementar MarkOccurrenceAsPaid: transacción atómica Dexie que verifica status=pending, crea Expense vinculado, actualiza occurrence (status=paid, transactionId=expenseId), encola SyncOperation tipo 'pay_recurring_occurrence'
    - Implementar MarkOccurrenceAsSkipped: actualiza status sin crear gasto
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x]* 3.4 Escribir property tests de persistencia y validación (P1, P2, P4)
    - **Property 1: Round-trip de persistencia** — para cada tipo de entidad, generar instancia válida, guardar en Dexie (fake-indexeddb), recuperar por id, verificar equivalencia
    - **Property 2: Validación de montos monetarios** — generar enteros y verificar que AmountCents acepta > 0, presupuestos >= 0, rechaza decimales y negativos
    - **Property 4: Unicidad de nombre de categoría normalizado** — generar pares de nombres equivalentes tras trim+lowercase, verificar rechazo del duplicado
    - Mínimo 100 iteraciones por propiedad
    - **Validates: Requirements 1.2, 2.1, 2.2, 3.1, 3.2, 4.2, 5.2, 7.5, 11.4**

  - [x]* 3.5 Escribir tests de integración para casos de uso críticos
    - Test: crear periodo con solapamiento → error PeriodOverlapError
    - Test: crear categoría duplicada (variaciones de case y espacios) → error CategoryDuplicateError
    - Test: MarkOccurrenceAsPaid crea gasto atómicamente, segundo intento falla
    - Test: DeleteCategory reasigna gastos a "Sin categoría"
    - Test: GenerateOccurrencesForPeriod no duplica ocurrencias existentes
    - Usar fake-indexeddb como backend de Dexie
    - _Requirements: 1.3, 4.2, 4.3, 6.3, 6.4_

- [x] 4. Fase 1C — Interfaz MVP: Dashboard, CRUD y simulador
  - **Objetivo**: Implementar las páginas React del MVP local: Dashboard con resúmenes financieros, CRUD de periodos/ingresos/gastos/categorías/presupuestos/recurrentes y simulador de compras.
  - **Dependencias**: Tarea 3.
  - **Prioridad**: MVP obligatoria.
  - **Criterios de completitud**: App usable completamente offline con todas las funcionalidades financieras. Dashboard muestra datos correctos. Responsive 320px–1440px.
  - **Tests mínimos**: Tests de componente para Dashboard y formularios principales con React Testing Library.
  - **Archivos/módulos esperados**: `src/presentation/pages/`, `src/presentation/components/`, `src/presentation/hooks/`, `src/presentation/context/`, `src/app/composition-root.ts` funcional.

  - [x] 4.1 Implementar composition root, contextos y layout base
    - Implementar `composition-root.ts`: instanciar GastoClaroDB, repositorios Dexie, casos de uso; exportar contexto consumible
    - Crear `PeriodContext` que gestiona periodo activo (auto-detecta periodo actual o muestra estado vacío)
    - Crear `AppLayout.tsx` con navegación responsive (sidebar desktop / bottom nav mobile)
    - Configurar React Router con rutas: Dashboard, Periodos, Ingresos, Gastos, Categorías, Presupuestos, Recurrentes, Simulador, Configuración
    - Crear componentes base: `LoadingState`, `EmptyState`, `ErrorBoundary`, `MoneyDisplay` (formatea centavos a moneda)
    - _Requirements: 10.3, 35.1, 37.1, 37.2, 36.1_

  - [x] 4.2 Implementar páginas CRUD: periodos, ingresos, gastos, categorías, presupuestos
    - Página Periodos: listado ordenado por startDate desc, crear (tipo + fechas), seleccionar como activo, estado vacío de creación
    - Página Ingresos: listado filtrado por periodo activo, formulario crear/editar (monto, descripción, fecha), eliminar con confirmación
    - Página Gastos: listado filtrado por periodo activo, formulario crear/editar (monto, descripción, fecha, categoría), eliminar con confirmación
    - Página Categorías: listado con color e ícono, crear/editar, eliminar con confirmación (muestra gastos afectados)
    - Página Presupuestos: listado por periodo activo, asignar/editar monto por categoría, total del periodo visible
    - Formularios con validación inline (mensajes por campo) usando esquemas Zod de `application/contracts/`
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 2.1, 2.3, 2.4, 3.1, 3.3, 3.4, 4.1, 4.3, 4.4, 5.1, 5.3, 5.4_

  - [x] 4.3 Implementar páginas de pagos recurrentes y simulador de compras
    - Página Recurrentes: listado de pagos (activos/inactivos), crear/editar (nombre, monto, frecuencia, fecha, categoría), activar/desactivar
    - Sub-sección de ocurrencias del periodo activo: visualizar con status (pending/paid/skipped), botones marcar como pagado / saltar
    - Compromisos pendientes visibles como total
    - Página Simulador: input de monto, selector de categoría, resultado en tiempo real (dinero disponible real después, presupuesto restante categoría, indicador negativo), botón "Convertir en gasto"
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 6.7, 9.1, 9.2, 9.3, 9.4_

  - [x] 4.4 Implementar Dashboard con resúmenes financieros y ritmo de gasto
    - Mostrar tarjetas: Saldo Actual, Presupuesto Restante total, Compromisos Pendientes, Dinero Disponible Real
    - Mostrar indicador de Ritmo de Gasto con estilos diferenciados (bajo/adecuado/alto/indeterminado), alerta visual si pace=high
    - Manejar estado vacío (sin periodo activo), estado de carga
    - Responsive: cards en columna mobile, grid desktop
    - Contraste WCAG AA en textos e indicadores
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 8.4, 8.5, 35.2_

  - [x]* 4.5 Escribir tests de componente para Dashboard y formularios
    - Test Dashboard: renderiza correctamente con datos mock, muestra estado vacío, muestra alerta de ritmo alto
    - Test formulario de gasto: validación inline de campos vacíos y monto inválido
    - Test simulador: muestra resultado negativo con indicador visual
    - Usar React Testing Library con providers mockeados
    - _Requirements: 10.1, 10.5, 37.1, 37.2_

- [x] 5. Fase 1D — Exportación/importación y PWA offline
  - **Objetivo**: Completar las funcionalidades offline: exportar/importar respaldos JSON, manifest PWA, service worker y indicadores offline.
  - **Dependencias**: Tarea 4.
  - **Prioridad**: MVP obligatoria.
  - **Criterios de completitud**: App instalable como PWA, funciona completamente offline. Export/import round-trip exitoso. Indicador offline visible.
  - **Tests mínimos**: Property test P17 (round-trip export/import), P18 (validación Zod). Test de servicio de backup.
  - **Archivos/módulos esperados**: `src/infrastructure/backup/BackupAdapter.ts`, `src/application/services/BackupService.ts`, `src/application/contracts/backup.schema.ts`, config PWA en `vite.config.ts`.

  - [x] 5.1 Implementar exportación/importación de respaldos
    - Crear `application/contracts/backup.schema.ts` con BackupFileSchema (valida schemaVersion, estructura completa de datos)
    - Implementar `BackupService.ts`: exportar (leer todas las entidades activas del usuario → construir BackupFile → JSON → descargar), importar (parsear → validar Zod → confirmar → reemplazar atómicamente en transacción Dexie)
    - Implementar lógica de migración entre versiones de schema (migrateV1toV2, etc.)
    - Rechazar archivos con schemaVersion futura con mensaje "actualiza la app"
    - Página/sección Configuración con botones Exportar e Importar
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x]* 5.2 Escribir property tests para exportación/importación (P17, P18)
    - **Property 17: Round-trip exportación/importación** — generar conjuntos de datos válidos, exportar, importar, verificar equivalencia
    - **Property 18: Validación Zod rechaza estructuras inválidas** — generar JSONs con campos faltantes/tipos incorrectos, verificar rechazo con error descriptivo
    - Mínimo 100 iteraciones por propiedad
    - **Validates: Requirements 12.1, 12.2, 12.5, 14.2**

  - [x] 5.3 Configurar PWA: manifest, service worker e indicadores offline
    - Instalar y configurar `vite-plugin-pwa` en `vite.config.ts` con `registerType: 'prompt'`
    - Configurar workbox: precaching de assets estáticos, NetworkFirst para HTML, NetworkOnly para Supabase API
    - Crear manifest.webmanifest con name, short_name, icons (192, 512, maskable-512), display standalone, theme_color
    - Crear/obtener iconos placeholder (se reemplazan después)
    - Implementar componente `OfflineIndicator` que muestra badge cuando `navigator.onLine === false`
    - Implementar componente `UpdatePrompt` que muestra banner "Nueva versión disponible" cuando service worker actualiza
    - Implementar botón "Instalar app" visible cuando `beforeinstallprompt` se dispara
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 11.2_

- [x] 6. Checkpoint MVP Local
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar: `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run build` sin errores
  - Verificar: app funciona completamente offline (periodos, ingresos, gastos, categorías, presupuestos, recurrentes, simulador, dashboard, export/import)
  - Verificar: PWA instalable, service worker activo, indicador offline funcional
  - _Requirements: 11.2, 13.1, 13.2, 38.4_

- [x] 7. Fase 2 — Autenticación y nube
  - **Objetivo**: Integrar Supabase Auth (registro, login, logout, recuperación), crear esquema PostgreSQL con RLS, implementar Edge Function de eliminación de cuenta y migración guest-to-user.
  - **Dependencias**: Tarea 6 (Checkpoint MVP Local).
  - **Prioridad**: MVP obligatoria.
  - **Criterios de completitud**: Registro, login, logout funcionales. RLS aísla datos por usuario. Edge Function elimina cuenta. Migración de datos locales a cuenta nueva funciona. Datos locales limpiados al logout.
  - **Tests mínimos**: Tests de integración para flujos de auth (mock Supabase client). Test de migración ownerId atómica.
  - **Archivos/módulos esperados**: `src/infrastructure/auth/`, `supabase/migrations/`, `supabase/functions/delete-account/`, esquema PostgreSQL completo.

  - [x] 7.1 Configurar Supabase y crear esquema PostgreSQL con RLS
    - Instalar `@supabase/supabase-js`
    - Crear `infrastructure/remote/SupabaseClient.ts` inicializando con vars de entorno
    - Crear migración SQL con todas las tablas: user_profiles, user_settings, periods, incomes, expenses, categories, category_budgets, recurring_payments, recurring_payment_occurrences, processed_operations
    - Aplicar convenciones: snake_case, timestamps con default, soft-delete
    - Crear constraint de no-solapamiento con GiST, FK compuestas para integridad cross-user
    - Crear UNIQUE partial index para recurring_occurrence_id en expenses
    - Habilitar RLS en todas las tablas y crear políticas (select_own, insert_own, update_own, delete_own)
    - _Requirements: 18.1, 18.2, 19.1, 19.2, 19.3_

  - [x] 7.2 Implementar autenticación: registro, login, logout, recuperación de contraseña
    - Implementar `SupabaseAuthClient.ts` con métodos: signUp, signIn, signOut, resetPassword, getSession, onAuthStateChange
    - Implementar `SessionManager.ts`: persiste sesión, detecta expiración, gestiona token
    - Crear `AuthContext.tsx` con estado de autenticación, usuario actual, loading
    - Crear páginas Auth: Login, Register, ForgotPassword, ResetPassword, VerifyEmail
    - Implementar validación de formularios (email formato válido, password >= 8 chars)
    - Implementar redirección: sin sesión → login, con sesión → dashboard
    - Implementar guardia de rutas protegidas
    - Implementar detección de sesión offline: si hay sesión local válida + datos locales → permitir acceso
    - Error genérico en login fallido (no revelar si email existe)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 17.1, 17.2, 17.3_

  - [x] 7.3 Implementar migración guest-to-user, limpieza al logout y eliminación de cuenta
    - Implementar `DataMigrationService.ts`: migración atómica de ownerId (guest:{uuid} → supabase uuid) en transacción Dexie
    - Flujo post-registro: si existen datos locales con ownerId guest → ofrecer migrar → confirmación → migración atómica
    - Flujo login en cuenta existente con datos locales guest: presentar decisión (conservar remotos / migrar locales / descartar locales)
    - Implementar limpieza completa al logout: eliminar todas las entidades, syncOperations, DeviceSyncState, UserSettings del ownerId
    - Advertencia pre-logout si syncOperations.count() > 0 ("X cambios sin sincronizar")
    - Crear Edge Function `delete-account`: validar token JWT, eliminar datos de todas las tablas por user_id, llamar admin.deleteUser(), retornar 200
    - Implementar flujo UI de eliminación: confirmación irreversible → llamar Edge Function → limpiar local → redirigir a inicio
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 24B.1, 24B.2, 24B.3, 24B.4, 24B.5, 24B.6, 16.7_

  - [x]* 7.4 Escribir tests para autenticación y migración
    - Test: migración atómica de ownerId actualiza todas las tablas correctamente
    - Test: migración fallida no deja registros parcialmente migrados
    - Test: limpieza al logout no deja datos accesibles
    - Test: flujo de registro con datos locales ofrece migración
    - Usar mocks de SupabaseAuthClient para tests de integración
    - _Requirements: 24B.1, 24B.5, 20.3_

- [x] 8. Fase 3 — Sincronización local-first
  - **Objetivo**: Implementar sincronización bidireccional con cola local, idempotencia remota, cursores por entidad, LWW con tie-breaking, tombstones y retries con backoff.
  - **Dependencias**: Tarea 7.
  - **Prioridad**: MVP obligatoria.
  - **Criterios de completitud**: Cambios locales se suben al servidor. Cambios remotos se descargan. Conflictos se resuelven con LWW. Reintentos no duplican datos. Tombstones previenen reaparición.
  - **Tests mínimos**: Property tests P14, P15, P16, P19. Tests de integración del SyncCoordinator con mocks.
  - **Archivos/módulos esperados**: `src/infrastructure/sync/`, `src/application/services/SyncCoordinator.ts`, indicadores de sync en UI.

  - [x] 8.1 Implementar cola de sincronización y operaciones atómicas local+cola
    - Refactorizar casos de uso existentes: cada escritura que requiere sync encola SyncOperation atómicamente en la misma transacción Dexie
    - Cada SyncOperation incluye: operationId (UUID), entityType, entityId, operationType, payload (JSON), createdAt (Instant), status='pending', retryCount=0
    - Implementar DeviceSyncState con cursores por entidad (tabla local)
    - Verificar que el orden de la cola se mantiene por createdAt ASC
    - _Requirements: 22.1, 22.2, 22.3, 22.4_

  - [x] 8.2 Implementar SyncCoordinator: upload, download y resolución de conflictos
    - Implementar `SyncCoordinatorImpl.ts` con métodos: uploadPendingChanges, downloadRemoteChanges, fullSync
    - Upload: leer operaciones pending ordenadas por createdAt, enviar a Supabase con operationId, marcar synced/error
    - Download con keyset pagination: por cada entityType, query con (updated_at, id) > cursor, LIMIT 100, loop hasta vacío
    - Resolución LWW: si remote.updatedAt > local.updatedAt → sobrescribir local; si iguales → id lexicográficamente mayor gana
    - Aplicar tombstones: si remote.deletedAt IS NOT NULL → marcar local como eliminado
    - Crear tabla `processed_operations` check en servidor (verificar en migración SQL de tarea 7.1 si no existe)
    - Registrar operationId en processed_operations tras aplicar mutación remota (BEGIN...COMMIT)
    - Manejar operación compuesta `pay_recurring_occurrence` como transacción PostgreSQL
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23B.1, 23B.2, 23B.3, 23B.5, 23B.6_

  - [x] 8.3 Implementar triggers de sync, retries, indicadores de estado y sync manual
    - Triggers: al iniciar app con conexión (download→upload→download), al recuperar conexión (online event), post-upload exitoso, botón manual
    - Backoff exponencial: `min(1000 * 2^retryCount, 60000)`, máximo 10 reintentos
    - Manejar errores: 401 → limpiar sesión y redirigir, error red → incrementar retryCount, 409 → LWW local
    - Implementar `SyncContext.tsx` con estado global de sync (synced/pending/error + count pendientes)
    - Crear componente `SyncStatusIndicator` con indicador visual de estado y botón "Sincronizar" manual
    - Mostrar advertencia pre-logout con cambios pendientes
    - _Requirements: 23B.4, 24.1, 24.2, 24.3, 24.4, 16.7_

  - [x]* 8.4 Escribir property tests de sincronización (P14, P15, P16, P19)
    - **Property 14: Cola de sincronización ordenada** — encolar N operaciones con timestamps aleatorios, verificar que findPending retorna en orden cronológico y que cada escritura local tiene exactamente una SyncOperation
    - **Property 15: Resolución LWW con tie-breaking** — generar pares de versiones (local, remote) con updatedAt variados, verificar que el más reciente gana; si iguales, id mayor gana
    - **Property 16: Exclusión de tombstones en consultas** — generar registros con deletedAt no nulo, verificar que queries de lectura no los incluyen
    - **Property 19: Preservación de DateOnly en sync** — generar DateOnly, simular ciclo local→remoto→local, verificar que el día no cambia por timezone
    - Mínimo 100 iteraciones por propiedad
    - **Validates: Requirements 22.2, 22.3, 23.4, 23.6, 39.3**

- [x] 9. Checkpoint Sincronización
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar: cambios creados offline se suben al reconectar
  - Verificar: cambios remotos se descargan correctamente
  - Verificar: conflictos se resuelven determinísticamente (LWW + tie-breaking)
  - Verificar: reintentos con mismo operationId no generan duplicados
  - Verificar: tombstones previenen reaparición de eliminados
  - Verificar: dos sesiones de navegador del mismo usuario convergen
  - _Requirements: 23.1, 23.4, 23.5, 23.6_

- [x] 10. Fase 4 — Reconocimiento de recibos (OCR)
  - **Objetivo**: Implementar captura de imagen, compresión, Edge Function de OCR con proveedor intercambiable, formulario editable de confirmación y entrada manual como fallback.
  - **Dependencias**: Tarea 7 (auth funcional para token).
  - **Prioridad**: Integración avanzada.
  - **Criterios de completitud**: Flujo completo: capturar/seleccionar imagen → comprimir → enviar a Edge Function → mostrar formulario pre-rellenado → confirmar → crear gasto. Fallback manual funciona. Mock en tests.
  - **Tests mínimos**: Test de integración con mock de ReceiptRecognitionProvider. Test de validación Zod de respuesta OCR.
  - **Archivos/módulos esperados**: `src/infrastructure/ocr/`, `src/infrastructure/platform/`, `supabase/functions/recognize-receipt/`, `src/application/contracts/receipt-result.schema.ts`, `src/presentation/pages/Receipts/`.

  - [x] 10.1 Implementar adaptador de cámara, compresión de imagen y Edge Function OCR
    - Crear `PlatformAdapter.ts` interfaz con métodos takePhoto y pickFromGallery
    - Implementar `WebPlatformAdapter.ts`: usa `<input type="file" accept="image/*" capture>` y FileReader
    - Implementar validación de imagen: tipo (JPEG/PNG), tamaño (< 10MB)
    - Implementar compresión con canvas: max 1920px, quality 0.8, output base64
    - Crear Edge Function `recognize-receipt`: valida JWT, extrae user_id, valida payload (Zod), llama proveedor OCR, estructura respuesta, retorna ReceiptRecognitionResult
    - Diseñar la Edge Function con proveedor intercambiable (configurar vía env var qué proveedor usar)
    - Crear `EdgeFunctionOCRAdapter.ts` que implementa ReceiptRecognitionProvider llamando a la Edge Function
    - Crear `application/contracts/receipt-result.schema.ts` con schema Zod de validación de respuesta
    - _Requirements: 25.1, 25.2, 26.1, 26.3, 31.1, 31.2, 31.3, 31.4_

  - [x] 10.2 Implementar UI de recibos: vista previa, formulario editable y flujo completo
    - Crear página Receipts con flujo paso a paso: seleccionar imagen → vista previa → confirmar envío → loading → formulario editable
    - Formulario pre-rellenado con datos OCR: comercio (descripción), fecha, total (en centavos), categoría
    - Campos vacíos si OCR no detectó (usuario completa manualmente)
    - Advertencia si moneda detectada ≠ moneda configurada → revisión manual obligatoria
    - Confirmación explícita antes de crear gasto
    - Al crear gasto: persistir en Repositorio_Local, eliminar imagen (no almacenar)
    - Manejo de errores: timeout/fallo del proveedor → mensaje + opción "ingresar manualmente"
    - Botón directo "Ingresar manualmente" como alternativa al OCR
    - _Requirements: 25.3, 26.2, 26.4, 26.5, 26.6, 27.1, 27.2, 27.3, 27.4_

  - [x]* 10.3 Escribir tests de OCR con mock del proveedor
    - Test: flujo completo con mock que retorna datos válidos → formulario se pre-rellena correctamente
    - Test: mock que retorna campos null → formulario vacío para completar
    - Test: mock que falla (timeout) → mensaje de error + opción manual
    - Test: validación Zod rechaza respuesta mal estructurada del proveedor
    - Test: imagen inválida (tipo incorrecto) → rechazo antes de enviar
    - _Requirements: 26.3, 26.5, 27.1_

- [x] 11. Fase 5 — Inteligencia artificial
  - **Objetivo**: Implementar sugerencia de categorías, resumen de periodo y explicación de cambios por categoría mediante Edge Functions con proveedor IA intercambiable. La IA solo genera texto, nunca calcula cifras.
  - **Dependencias**: Tarea 7 (auth funcional para token).
  - **Prioridad**: Integración avanzada.
  - **Criterios de completitud**: Sugerencia de categoría preselecciona en formulario de gasto. Resumen del periodo se muestra. Explicación de cambios funciona. Rate limiting activo. Fallos no bloquean flujo principal.
  - **Tests mínimos**: Tests con mock de AIInsightsProvider. Validación Zod de respuestas. Property test P20 para cálculo de porcentaje de cambio.
  - **Archivos/módulos esperados**: `src/infrastructure/ai/`, `supabase/functions/ai-insights/`, `src/application/contracts/ai-response.schema.ts`.

  - [x] 11.1 Implementar Edge Function de IA y adaptador con rate limiting
    - Crear Edge Function `ai-insights` con endpoints: POST /suggest-category, POST /period-summary, POST /explain-changes
    - Validar JWT en cada request, extraer user_id
    - Implementar rate limiting: máximo 10 requests/minuto por usuario (almacenado en memoria o KV)
    - Diseñar con proveedor intercambiable (env var selecciona proveedor)
    - Validar payloads con Zod (limitar: descripción max 2000 chars, max 50 categorías)
    - Crear `EdgeFunctionAIAdapter.ts` implementando AIInsightsProvider
    - Crear `application/contracts/ai-response.schema.ts` con schemas: CategorySuggestionSchema, PeriodSummarySchema, CategoryChangeExplanationSchema
    - Manejar fallo del proveedor IA: retornar null/error sin bloquear
    - _Requirements: 28.1, 28.3, 29.1, 29.3, 30.2, 30.4, 31.1, 31.2, 31.3, 31.4, 31.5_

  - [x] 11.2 Implementar UI de IA: sugerencias, resumen y explicaciones
    - Integrar sugerencia de categoría en formulario de gasto: al escribir descripción, llamar suggest-category (debounced), preseleccionar categoría sugerida sin aplicar automáticamente
    - Si sugerencia falla o es inválida → no bloquear, usuario elige manualmente
    - Crear sección "Resumen del periodo" en Dashboard o página dedicada: botón para solicitar, mostrar texto + highlights, manejar estado de carga y error
    - Implementar `computeCategoryChangePercentage` (ya en dominio) y vista de "Insights": calcular cambios con TypeScript, enviar a IA para explicación textual, mostrar cifras calculadas + texto IA
    - Toda la información de IA es solo lectura, sin botones de acción automática
    - Confirmar que cifras provienen de funciones TS, no de la respuesta IA
    - _Requirements: 28.1, 28.2, 28.4, 29.1, 29.2, 29.4, 30.1, 30.2, 30.3, 30.5_

  - [x]* 11.3 Escribir tests de IA con mock y property test P20
    - **Property 20: Porcentaje de cambio por categoría** — generar AmountCents actual y anterior, verificar: si anterior > 0 → ((actual-anterior)/anterior)*100; si anterior = 0 → null
    - Test: sugerencia de categoría con mock → categoría preseleccionada correctamente
    - Test: sugerencia falla → formulario funciona sin sugerencia
    - Test: validación Zod rechaza respuesta IA mal formada
    - Test: rate limiting (11ª solicitud) → error apropiado
    - **Validates: Requirements 28.3, 28.4, 30.1**

- [x] 12. Fase 6 — Android con Capacitor
  - **Objetivo**: Configurar Capacitor, generar proyecto Android, implementar adaptadores nativos (cámara, red, deep links) y generar APK instalable.
  - **Dependencias**: Tareas 6 (PWA web funciona), 7 (auth), 8 (sync), 10 (OCR con cámara).
  - **Prioridad**: Pulido final.
  - **Criterios de completitud**: APK generado e instalable en emulador/dispositivo. Cámara nativa funciona. Deep links de auth redirigen a la app. Sync funciona en Android.
  - **Tests mínimos**: Smoke test manual en emulador: login, crear gasto, capturar recibo, sync.
  - **Archivos/módulos esperados**: `capacitor.config.ts`, `android/`, `src/infrastructure/platform/CapacitorPlatformAdapter.ts`.

  - [x] 12.1 Configurar Capacitor y generar proyecto Android
    - Instalar `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`
    - Crear `capacitor.config.ts` con appId 'com.gastoclaro.app', webDir 'dist', androidScheme 'https'
    - Ejecutar `pnpm exec cap add android` para generar proyecto Android
    - Configurar AndroidManifest.xml: permisos INTERNET, ACCESS_NETWORK_STATE, intent-filter para deep link `com.gastoclaro.app://auth/callback`
    - Configurar redirect URL en dashboard de Supabase
    - Verificar `pnpm build` y `pnpm exec cap sync android` sin errores
    - _Requirements: 32.1, 32.2, 34.1, 34.2, 34.3_

  - [x] 12.2 Implementar adaptadores nativos y generar APK
    - Instalar `@capacitor/camera`, `@capacitor/network`, `@capacitor/browser`
    - Implementar `CapacitorPlatformAdapter.ts`: takePhoto/pickFromGallery con @capacitor/camera, getNetworkStatus/onNetworkChange con @capacitor/network, openExternalUrl con @capacitor/browser
    - Actualizar composition-root para detectar plataforma e inyectar adaptador correcto (Web vs Capacitor)
    - Implementar manejo de permiso de cámara denegado: mensaje explicativo + alternativa galería
    - Implementar interceptación de deep link para auth callback: extraer token del URL, completar flujo de auth
    - Generar APK debug: `cd android && ./gradlew assembleDebug`
    - Verificar APK se instala y ejecuta en emulador Android
    - _Requirements: 32.3, 32.4, 33.1, 33.2, 33.3, 33.4_

- [x] 13. Checkpoint Final
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar: `pnpm lint` sin errores
  - Verificar: `pnpm typecheck` sin errores
  - Verificar: `pnpm test:run` — todos los property tests y unit tests pasan
  - Verificar: `pnpm build` exitoso
  - Verificar: app funciona offline completamente (CRUD, cálculos, simulador, export/import)
  - Verificar: registro, login, logout, recuperación de contraseña funcionales
  - Verificar: sincronización bidireccional entre dos sesiones de navegador
  - Verificar: OCR funciona con mock de proveedor (Edge Function desplegada o mock local)
  - Verificar: IA funciona con mock de proveedor (sugerencias, resumen, explicaciones)
  - Verificar: APK Android generado e instalable en emulador
  - Verificar: cámara nativa funciona en Android (emulador)
  - Verificar: deep links de auth redirigen correctamente en Android
  - _Requirements: 38.1, 38.2, 38.3, 38.4, 38.5_

- [x] 14. Documentación final
  - **Objetivo**: Crear README.md con instrucciones de desarrollo, arquitectura resumida, screenshots y limitaciones conocidas.
  - **Dependencias**: Tarea 13.
  - **Prioridad**: Pulido final.
  - **Criterios de completitud**: README completo con setup, comandos, arquitectura y limitaciones.
  - **Tests mínimos**: Ninguno (documentación).
  - **Archivos/módulos esperados**: `README.md`.

  - [x] 14.1 Crear README con setup, arquitectura y limitaciones
    - Sección: Descripción del proyecto y stack tecnológico
    - Sección: Requisitos previos (Node 22.x, pnpm, Android SDK para APK)
    - Sección: Setup y comandos (`pnpm install`, `pnpm dev`, `pnpm build`, `pnpm test:run`, `pnpm lint`)
    - Sección: Variables de entorno necesarias
    - Sección: Arquitectura resumida (diagrama de capas, responsabilidades)
    - Sección: Generar APK (`pnpm build`, `pnpm exec cap sync android`, `cd android`, `./gradlew assembleDebug`)
    - Sección: Limitaciones conocidas (LWW puede perder datos concurrentes, relojes desincronizados, no iOS, no Google Play, no CRDT, no colaboración)
    - Incluir screenshots de las pantallas principales (placeholder si no se tienen)
    - _Requirements: 34.2, 34.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP or if credits run low.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation between phases.
- Property tests validate universal correctness properties from the design document.
- Unit tests validate specific examples and edge cases.
- La IA nunca produce valores numéricos; las cifras provienen exclusivamente de funciones TypeScript puras.
- Los importes monetarios se almacenan como enteros en centavos (sin punto flotante).
- Las fechas de usuario usan DateOnly (YYYY-MM-DD); los timestamps del sistema usan Instant (UTC).
- El dominio no depende de React, Dexie, Supabase ni Zod. Los esquemas Zod viven en `application/contracts/`.
- La sincronización usa last-write-wins con tie-breaking determinista por id — limitación aceptada del MVP.

### Prioridades

| Etiqueta             | Tareas | Descripción                                    |
| -------------------- | ------ | ---------------------------------------------- |
| MVP obligatoria      | 1–9    | Funcionalidad completa offline + auth + sync   |
| Integración avanzada | 10, 11 | OCR y IA (requieren conexión y Edge Functions) |
| Pulido final         | 12, 14 | Android y documentación                        |

### Resumen

- **Tareas principales**: 14
- **Subtareas ejecutables**: 38
- **Ruta crítica**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 12 → 13
- **Tareas independientes ejecutables en paralelo**: 10 y 11 (ambas dependen solo de tarea 7, no de 8/9)
- **Checkpoint MVP local**: Tarea 6 (app usable sin cuenta, completamente offline)
- **Checkpoint sincronización**: Tarea 9 (sync bidireccional verificada)
- **Tareas opcionales que pueden saltarse si los créditos se agotan**: 2.3, 2.5, 3.4, 3.5, 4.5, 5.2, 7.4, 8.4, 10.3, 11.3, 14.1

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2", "2.4"] },
    { "id": 5, "tasks": ["2.3", "2.5"] },
    { "id": 6, "tasks": ["3.1"] },
    { "id": 7, "tasks": ["3.2", "3.3"] },
    { "id": 8, "tasks": ["3.4", "3.5"] },
    { "id": 9, "tasks": ["4.1"] },
    { "id": 10, "tasks": ["4.2", "4.3"] },
    { "id": 11, "tasks": ["4.4"] },
    { "id": 12, "tasks": ["4.5", "5.1"] },
    { "id": 13, "tasks": ["5.2", "5.3"] },
    { "id": 14, "tasks": ["7.1"] },
    { "id": 15, "tasks": ["7.2"] },
    { "id": 16, "tasks": ["7.3"] },
    { "id": 17, "tasks": ["7.4", "10.1", "11.1"] },
    { "id": 18, "tasks": ["8.1", "10.2", "11.2"] },
    { "id": 19, "tasks": ["8.2", "10.3", "11.3"] },
    { "id": 20, "tasks": ["8.3"] },
    { "id": 21, "tasks": ["8.4"] },
    { "id": 22, "tasks": ["12.1"] },
    { "id": 23, "tasks": ["12.2"] },
    { "id": 24, "tasks": ["14.1"] }
  ]
}
```
