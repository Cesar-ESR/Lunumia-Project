# Lunumia 2.0 — Plan Maestro

**Versión:** 0.3  
**Fecha:** 11 de agosto de 2026  
**Estado:** Especificación funcional, financiera, técnica y UX lista para iniciar implementación  
**Documento de referencia:** `docs/lunumia-2.0-plan-master.md`

---

# 1. Visión del producto

**Lunumia** es una aplicación de control financiero personal diseñada para ayudar al usuario a entender su situación actual, anticipar sus próximos compromisos y tomar mejores decisiones con su dinero.

Debe responder con claridad a tres preguntas:

- **¿Cuánto tengo hoy?**
- **¿Cómo he estado usando mi dinero?**
- **¿Qué viene después y cómo puedo prepararme?**

Lunumia no debe sentirse como una hoja de cálculo, un sistema contable, una app bancaria ni una aplicación de cortes de caja.

## Propuesta principal

> **Lunumia te ayuda a entender cuánto tienes, cuánto has gastado, qué pagos tienes próximos y cuánto puedes usar sin comprometer tus finanzas.**

**Tagline:**

> **Claridad para tus finanzas.**

## Personalidad

Lunumia debe sentirse:

```text
Clara
Tranquila
Inteligente
Moderna
Confiable
No invasiva
```

No debe sentirse:

```text
Contable
Punitiva
Alarmista
Crypto
Excesivamente técnica
```

---

# 2. Modelo mental principal: Hoy / Pasado / Futuro

Lunumia 2.0 se organiza alrededor de tres momentos financieros.

## Hoy

Responde:

> **¿Dónde estoy ahora?**

Incluye:

- Saldo actual
- Gastos realizados
- Ingresos recibidos
- Presupuesto utilizado
- Próximos pagos
- Dinero comprometido
- Pagos vencidos
- Disponible proyectado

## Pasado

Responde:

> **¿Cómo he manejado mi dinero?**

Incluye:

- Historial
- Periodos terminados
- Comparaciones
- Gastos por categoría
- Resultado del periodo
- Cambios de comportamiento
- Análisis determinista
- Resumen inteligente cuando esté disponible

## Futuro

Responde:

> **¿Qué podría pasar después?**

Incluye:

- Próximo periodo
- Ingresos esperados
- Pagos recurrentes estimados
- Proyecciones
- Simulaciones
- Futuras metas y planes de ahorro

---

# 3. Redefinición de Periodos

`Period` se conserva como entidad interna porque ya forma parte del dominio, las FKs, el almacenamiento y la sincronización.

El usuario no debe aprender “Periodos” como producto principal.

```text
Periodo pasado
→ Historial

Periodo que contiene hoy
→ Periodo actual

Periodo futuro
→ Planificación
```

Los periodos son **ventanas temporales de organización y análisis**, no cuentas de dinero independientes.

## Regla de continuidad

El dinero no se reinicia al cambiar de periodo.

```text
fin de periodo A
      ↓
el saldo continúa
      ↓
periodo B
```

---

# 4. Feature Mapping

## Navegación actual → Lunumia 2.0

| Actual | Lunumia 2.0 | Decisión |
|---|---|---|
| Dashboard | **Inicio** | Rediseñar |
| Periodos | Periodo actual + Historial + Planificación | Dividir conceptualmente |
| Gastos | Movimientos → Gastos | Integrar |
| Ingresos | Movimientos → Ingresos recibidos | Integrar |
| Recurrentes | Próximos pagos / reglas de recurrencia | Reubicar |
| Categorías | Gestión contextual | Quitar del menú principal |
| Presupuestos | **Presupuesto** | Mantener + rediseñar |
| Simulador | Planificación → ¿Qué pasa si...? | Integrar |
| Insights | **Análisis** | Renombrar + rediseñar |
| Configuración | **Configuración** | Mantener |
| — | **Movimientos** | Nueva vista agregadora |
| — | **Planificación** | Nueva vista conceptual |
| — | **Historial** | Nueva presentación |
| — | **Onboarding 2.0** | Nueva experiencia |

## Navegación objetivo

```text
LUNUMIA

Inicio
Movimientos
Presupuesto
Planificación

──────────────

Análisis
Historial

──────────────

Configuración
```

---

# 5. Principio financiero fundamental

> **La fecha indica cuándo corresponde financieramente algo. El estado indica si realmente ocurrió.**

Nunca asumir:

```text
fecha llegó
→ ocurrió
```

Ejemplos:

```text
Renta venció
≠ renta pagada

Nómina debía llegar
≠ nómina recibida
```

---

# 6. Métricas principales de Inicio

| Métrica | Pregunta |
|---|---|
| **Saldo actual** | ¿Cuánto dinero tengo ahora según Lunumia? |
| **Gastado** | ¿Cuánto dinero ya salió durante mi periodo actual? |
| **Comprometido** | ¿Cuánto tengo pendiente hasta el final del horizonte actual, incluyendo vencidos? |
| **Disponible proyectado** | ¿Cuánto me quedaría después de cubrir esos compromisos? |

Nunca volver a utilizar:

```text
Dinero disponible real
```

si el valor contiene deducciones futuras.

---

# 7. BalanceAnchor

## Propósito

El modelo actual `ingresos - gastos` no permite conocer cuánto dinero tiene realmente una persona que empieza a usar Lunumia con dinero previo.

`BalanceAnchor` representa:

> **Un punto en el que el usuario confirmó cuánto dinero tenía realmente.**

```ts
interface BalanceAnchor extends SyncableEntity {
  amount: SignedMoney
  capturedAt: Instant
  ledgerCutoffAt: Instant
}
```

`amount`:

- entero en centavos;
- puede ser positivo;
- puede ser cero;
- puede ser negativo.

## No es un ingreso

Configurar:

```text
Tengo actualmente $6,000
```

crea:

```text
BalanceAnchor
```

No:

```text
Income +$6,000
```

## Reconciliación

Si Lunumia calcula `$6,820` pero el usuario confirma `$6,750`:

```text
nuevo BalanceAnchor = $6,750
```

No inventar:

```text
Expense $70
```

porque desconocemos la causa real de la diferencia.

---

# 8. Momento efectivo del balance

## Problema resuelto

`createdAt` es un timestamp técnico y **no puede usarse como momento universal en el que el dinero entró o salió**.

Ejemplo:

```text
10 ago
crear ingreso esperado

11 ago
crear BalanceAnchor

15 ago
confirmar ingreso recibido
```

El ingreso se creó antes del anchor, pero el dinero entró después.

## Decisión definitiva

Agregar:

```ts
balanceEffectiveAt
```

a movimientos realizados.

### Income

```ts
interface Income extends SyncableEntity {
  periodId: string
  amount: Money
  description: string
  date: DateOnly

  status: IncomeStatus
  affectsBalance: boolean
  balanceEffectiveAt: Instant | null
}
```

### Expense

```ts
interface Expense extends SyncableEntity {
  periodId: string
  categoryId: string
  amount: Money
  description: string
  date: DateOnly

  recurringOccurrenceId: string | null

  affectsBalance: boolean
  balanceEffectiveAt: Instant
}
```

## Semántica de Income

```text
expected
→ balanceEffectiveAt = null

cancelled
→ balanceEffectiveAt = null

received
→ balanceEffectiveAt = momento en que se confirmó recibido
```

## Semántica de Expense

Un `Expense` siempre representa un gasto realizado.

Al crearlo:

```text
balanceEffectiveAt = now
```

aunque la `date` financiera sea histórica.

## Compatibilidad legacy

Para datos anteriores a 2.0:

```text
Income legacy received
→ balanceEffectiveAt = createdAt

Expense legacy
→ balanceEffectiveAt = createdAt
```

Es una aproximación de compatibilidad; no se inventarán timestamps históricos que no existen.

---

# 9. affectsBalance

`affectsBalance` separa:

```text
historial / análisis
```

de:

```text
cambio sobre el saldo desde el último anchor
```

## Ejemplo

Hoy el usuario confirma:

```text
Saldo = $6,000
```

Después registra:

```text
Gasto del 5 de agosto
$500
```

Lunumia debe preguntar conceptualmente:

> ¿Este movimiento ya estaba incluido en el saldo que configuraste?

### Sí

```text
affectsBalance = false
```

Resultado:

```text
Historial        ✅
Gastado          ✅
Presupuesto      ✅
Saldo actual     sin cambio
```

### No

```text
affectsBalance = true
balanceEffectiveAt = now
```

Resultado:

```text
Historial        ✅
Gastado          ✅
Saldo actual     -$500
```

---

# 10. IncomeStatus

```ts
type IncomeStatus =
  | 'expected'
  | 'received'
  | 'cancelled'
```

## `expected`

Dinero previsto pero no confirmado.

```text
CurrentBalance          ❌
ExpectedIncome          ✅
Planificación           ✅
```

## `received`

Dinero realmente recibido.

```text
CurrentBalance          ✅
Movimientos             ✅
```

## `cancelled`

Ingreso previsto que ya no ocurrirá.

```text
CurrentBalance          ❌
ExpectedIncome          ❌
```

Se conserva en historial de planificación cuando sea útil.

## Transiciones

```text
EXPECTED
  ├──→ RECEIVED
  └──→ CANCELLED
```

No convertir automáticamente:

```text
RECEIVED → EXPECTED
RECEIVED → CANCELLED
```

Las correcciones de un ingreso ya realizado se manejan mediante edición/eliminación explícita.

---

# 11. Ingreso esperado vencido

No añadir un estado persistido `overdue`.

Derivar:

```text
status = expected
AND date < today
→ overdueExpected = true
```

UX:

```text
Nómina
Esperada el 10 de agosto
$8,000

⚠ Pendiente de confirmar

[ Recibido ]
[ Cambiar fecha ]
[ Cancelar ]
```

## Regla conservadora

Un ingreso esperado vencido **no entra automáticamente en la proyección futura**.

```text
ExpectedIncome =
status = expected
AND today <= date <= projectionEnd
```

Mientras:

```text
OverdueExpectedIncome =
status = expected
AND date < today
```

---

# 12. Gastado

```text
Spent =
SUM(
  activePeriod expenses
)
```

`affectsBalance` no participa.

Un gasto histórico puede:

```text
afectar spent
sin afectar currentBalance
```

---

# 13. Pagos recurrentes y Occurrence snapshot

## Estados persistidos

```text
pending
paid
skipped
```

## Estado derivado

```text
pending
AND dueDate < today
→ overdue
```

## Snapshot de monto

Agregar:

```ts
amount: Money
```

a `RecurringPaymentOccurrence`.

Cuando se genera:

```text
RecurringPayment.amount
        ↓
Occurrence.amount
```

Después:

```text
editar RecurringPayment.amount
```

no modifica ocurrencias ya generadas.

---

# 14. Horizonte definitivo de Comprometido

El comprometido del Inicio no puede limitarse exclusivamente a:

```text
periodId === currentPeriod.id
```

porque desaparecerían pagos vencidos de periodos anteriores.

## Horizonte

Si existe periodo actual:

```text
projectionEnd = currentPeriod.endDate
```

## OverdueCommitted

```text
SUM(
  pending occurrences
  WHERE dueDate < today
)
```

## UpcomingCommitted

```text
SUM(
  pending occurrences
  WHERE today <= dueDate <= projectionEnd
)
```

## Committed

```text
Committed =
OverdueCommitted
+
UpcomingCommitted
```

Los vencidos siguen siendo compromisos mientras no se paguen u omitan.

---

# 15. Sin periodo actual

Sin periodo actual todavía pueden calcularse:

```text
CurrentBalance
OverdueCommitted
OverdueExpectedIncome
```

Pero no existe un horizonte completo de periodo.

Entonces:

```ts
projectionHorizonEnd = null
projectionCoverage = 'overdue_only'
```

La UI puede mostrar:

> Configura tu periodo actual para completar tus proyecciones.

---

# 16. Pago realizado con monto diferente al previsto

Una ocurrencia guarda el monto comprometido esperado:

```text
Occurrence.amount = $3,000
```

Pero el pago real puede ser:

```text
Expense.amount = $3,100
```

## Use case

```ts
MarkOccurrenceAsPaid({
  occurrenceId,
  actualAmountCents?: number
})
```

Default:

```text
actualAmountCents = occurrence.amount
```

Si el monto real difiere, `Expense` registra el valor real y la proyección cambia por la diferencia.

---

# 17. Reversión de pago recurrente

Invariante:

```text
Occurrence.status = paid
→ exactamente 1 Expense activo
  con recurringOccurrenceId = occurrence.id
```

Si el gasto vinculado se elimina/revierte:

```text
Expense → soft deleted
+
Occurrence paid → pending
```

de forma atómica.

Nunca dejar:

```text
Occurrence paid
+
Expense inexistente
```

---

# 18. Futuro recurrente: proyección ≠ compromiso

Para periodos futuros no crear `RecurringPaymentOccurrence` persistidas solamente para planificar.

Usar:

```text
RecurringPayment rules
        ↓
pure projection
        ↓
ProjectedRecurringPayment
```

Cuando el periodo pasa a ser actual:

```text
GenerateOccurrencesForPeriod
```

crea los compromisos concretos.

Esto mantiene:

```text
FUTURO
→ proyección

PRESENTE
→ compromiso
```

---

# 19. Resolver el periodo actual

La autoridad semántica será la fecha:

```text
CurrentPeriod =
active, non-deleted period
WHERE
startDate <= today <= endDate
```

La regla de no solapamiento debe garantizar como máximo uno.

`user_settings.activePeriodId` se conserva por compatibilidad y como referencia/cache de trabajo, pero **no puede convertir un periodo viejo o futuro en “actual”**.

Puede autocorregirse cuando no coincide con el periodo resuelto por fecha.

---

# 20. Invariante movimiento ↔ periodo

La fecha financiera de un movimiento debe pertenecer a su `periodId`.

Si se cambia:

```text
Expense.date
Income.date
```

debe resolverse el periodo que contiene la nueva fecha.

Si existe:

```text
actualizar periodId
```

Si no existe:

```text
rechazar con error de dominio
→ UI pide crear/seleccionar periodo válido
```

No guardar combinaciones inconsistentes.

---

# 21. Presupuesto

El presupuesto responde:

> **¿Cuánto quiero gastar?**

No:

> ¿Cuánto dinero tengo?

```text
BudgetRemaining =
CategoryBudget.amount
-
SUM(category expenses)
```

Nunca modifica:

```text
CurrentBalance
Committed
ProjectedAvailable
```

---

# 22. FinancialSnapshot definitivo

```ts
interface FinancialSnapshot {
  currentBalanceCents: number | null

  spentCents: number

  committedCents: number
  upcomingCommittedCents: number
  overdueCommittedCents: number

  projectedAvailableCents: number | null

  expectedIncomeCents: number
  overdueExpectedIncomeCents: number

  projectedClosingBalanceCents: number | null

  projectionHorizonEnd: DateOnly | null
  projectionCoverage: 'full_period' | 'overdue_only'
}
```

## CurrentBalance

Si no hay anchor:

```text
null
```

Si existe:

```text
LatestBalanceAnchor.amount

+ SUM(
    received incomes
    WHERE affectsBalance = true
    AND balanceEffectiveAt > anchor.ledgerCutoffAt
  )

- SUM(
    expenses
    WHERE affectsBalance = true
    AND balanceEffectiveAt > anchor.ledgerCutoffAt
  )
```

## Spent

```text
SUM expenses del currentPeriod
```

## OverdueCommitted

```text
pending AND dueDate < today
```

## UpcomingCommitted

```text
pending
AND today <= dueDate <= currentPeriod.endDate
```

## Committed

```text
OverdueCommitted + UpcomingCommitted
```

## ExpectedIncome

```text
expected
AND today <= date <= currentPeriod.endDate
```

## OverdueExpectedIncome

```text
expected
AND date < today
```

## ProjectedAvailable

```text
CurrentBalance - Committed
```

## ProjectedClosingBalance

```text
CurrentBalance
+
ExpectedIncome
-
Committed
```

Puede ser negativo.

---

# 23. PlanningProjection

Planificación futura no debe reutilizar ciegamente el snapshot del presente.

Definir un contrato puro separado:

```ts
interface PlanningProjection {
  periodId: string

  projectedOpeningBalanceCents: number | null

  expectedIncomeCents: number
  projectedRecurringPaymentsCents: number

  projectedClosingBalanceCents: number | null
}
```

Motor conceptual:

```text
periodo futuro
+
ingresos expected del periodo
+
RecurringPayment rules
+
opening projected balance
        ↓
calculatePlanningProjection()
```

No crea movimientos ni occurrences.

Para el siguiente periodo, el `projectedOpeningBalance` puede derivarse del cierre proyectado del periodo actual cuando exista suficiente información.

---

# 24. Source of truth

La UI nunca debe implementar fórmulas financieras por cuenta propia.

```text
Repositories
      ↓
Use Case
      ↓
Pure domain engine
      ↓
FinancialSnapshot / PlanningProjection
      ↓
UI / Simulator / Analysis
```

IA no participa en los cálculos.

---

# 25. Invariantes de dominio

1. Futuro ≠ realizado.
2. Fecha ≠ estado.
3. `createdAt` ≠ momento financiero.
4. Ingreso `expected` no aumenta saldo.
5. Pago `pending` no reduce saldo.
6. Gasto realizado sí reduce saldo cuando `affectsBalance=true`.
7. Pago realizado deja de estar comprometido.
8. Un movimiento nunca se cuenta dos veces.
9. Presupuesto no modifica saldo.
10. Simulación no persiste movimientos reales.
11. El dinero no se reinicia entre periodos.
12. Periodos son ventanas temporales.
13. Todos los importes usan integer cents.
14. `overdue` es derivado, no persistido.
15. `Expense.recurringOccurrenceId` es vínculo autoritativo.
16. No reintroducir `transactionId` en occurrences.
17. Occurrence conserva snapshot de monto.
18. Paid occurrence requiere exactamente un gasto activo.
19. Movimiento y periodo deben ser coherentes por fecha.
20. Ninguna migración inventa un BalanceAnchor.

---

# 26. Dashboard / Inicio 2.0

Misión:

> **Explicar cómo está el dinero hoy.**

Ejemplo:

```text
Tu dinero hoy

Saldo actual
$6,000

Gastado este periodo
$1,400

Comprometido
$2,500

Disponible proyectado
$3,500
```

Debajo:

```text
Tu periodo actual
1–15 agosto
Día 11 de 15

Presupuesto utilizado
68%

Próximos pagos
12 ago · Internet      $600
15 ago · Renta       $1,900
```

Si hay vencidos:

```text
⚠ Tienes $500 en pagos vencidos
```

Si no hay anchor:

```text
Saldo actual
No configurado

[ Configurar saldo ]
```

---

# 27. Lenguaje de producto

| Evitar | Usar |
|---|---|
| Periodos como sección principal | Periodo actual / Historial / Planificación |
| Recurrentes como lenguaje principal | Próximos pagos / recurrencia |
| Insights | Análisis |
| Dinero disponible real | Saldo actual / Disponible proyectado |
| Simulador | ¿Qué pasa si...? |
| Ahorro para cualquier remanente | Margen / Resultado / Disponible |

Evitar:

> Gastaste demasiado.

Usar:

> Superaste tu presupuesto de entretenimiento en $150.

Evitar:

> Tus finanzas están mal.

Usar:

> Tus compromisos actuales superan tu saldo en $1,000.

---

# 28. Design System Lunumia 2.0

El sistema debe soportar:

```text
light
dark
system
```

## Brand

```text
Cyan      #09BDFB
Blue      #2563FF
Purple    #8B32F4
```

```css
linear-gradient(135deg, #09BDFB, #2563FF, #8B32F4)
```

Uso limitado a:

- logo;
- CTA principal;
- selección importante;
- accent puntual;
- visualización destacada.

No usar el gradiente en todas las cards.

## Dark

```text
Background       #070A12
Surface          #0D1220
Elevated         #12192A
Border           #1E293B

Text Primary     #F8FAFC
Text Secondary   #94A3B8
```

## Light

```text
Background       #F6F8FC
Surface          #FFFFFF
Elevated         #F8FAFC
Border           #DCE3EF

Text Primary     #0F172A
Text Secondary   #64748B
```

Los valores finales deben validarse contra WCAG AA.

## Colores semánticos

```text
Verde    → ingreso / positivo / éxito
Rojo     → gasto / error / déficit
Ámbar    → advertencia / vencimiento
Azul     → información
Cyan/Violeta → identidad/interacción
```

El color nunca será el único indicador de estado.

---

# 29. Escalas del Design System

## Spacing

Base 4px:

```text
4
8
12
16
24
32
48
64
```

## Radius

```text
8   controles compactos
12  inputs / buttons
16  cards
24  superficies destacadas
```

## Tipografía inicial

```text
12  caption
14  secondary
16  body
20  section title
24  page title
32  financial hero
```

## Motion

```text
120ms  feedback pequeño
180ms  controles
250ms  sheets / dialogs
```

Respetar:

```css
prefers-reduced-motion
```

---

# 30. Componentes base

El Design System debe incluir como mínimo:

```text
Button
IconButton
MoneyInput
TextInput
DateInput
Select
Tabs
Card
MetricCard
TransactionRow
PaymentRow
PeriodCard
ProgressBar
Badge
Alert
Toast
Dialog
BottomSheet
Drawer
Skeleton
EmptyState
ErrorState
OfflineIndicator
SyncStatus
ChartContainer
```

---

# 31. Navegación 2.0

## Desktop

Sidebar:

```text
LUNUMIA

Inicio
Movimientos
Presupuesto
Planificación

────────

Análisis
Historial

────────

Configuración
```

## Tablet

Navigation rail colapsable:

```text
iconos
+
tooltips
```

Drawer completo bajo demanda.

## Mobile

Bottom navigation:

```text
Inicio
Movimientos
Presupuesto
Planificación
Más
```

`Más`:

```text
Análisis
Historial
Configuración
```

Acción rápida contextual:

```text
+ Movimiento
```

---

# 32. Movimientos 2.0

**Movimientos contiene hechos financieros realizados.**

Tabs:

```text
Todos
Gastos
Ingresos
```

No mezclar pagos pendientes en “Todos”.

## Todos

```text
Nómina                 +$8,000
Supermercado             -$560
Gasolina                  -$800
```

## Gastos

Solo `Expense`.

## Ingresos

Solo:

```text
Income.status = received
```

`expected` vive en Planificación.

## Orden

```text
financial date DESC
balanceEffectiveAt DESC
id como desempate
```

---

# 33. Crear movimiento

Acción:

```text
+ Movimiento
```

Opciones:

```text
Registrar gasto
Registrar ingreso
```

Gasto:

```text
Manual
Escanear recibo
```

Ingreso normal:

```text
status = received
```

Ingreso esperado se crea desde Planificación.

---

# 34. Editar y eliminar movimientos

Se puede editar:

```text
monto
descripción
fecha
categoría
```

Cambiar fecha obliga a resolver el `periodId` correspondiente.

Cuando el cambio cruza el BalanceAnchor, la UI debe revisar `affectsBalance`.

Eliminar usa soft delete.

Si se elimina un gasto vinculado a una occurrence pagada:

```text
Expense soft-delete
+
Occurrence paid → pending
```

atómicamente.

---

# 35. Presupuesto 2.0

Responde exclusivamente:

> **¿Cuánto quiero gastar?**

Ejemplo:

```text
Presupuesto
1–15 agosto

Alimentación
$1,240 / $2,000
62%

Transporte
$580 / $1,000
58%

Entretenimiento
$850 / $700
121%
```

Estados:

```text
<80%
Normal

80–99%
Cerca del límite

>=100%
Excedido
```

## Temporalidad

```text
Periodo actual
→ editable

Periodo futuro
→ editable como planificación

Periodo pasado
→ read-only
```

---

# 36. Próximos pagos 2.0

Viven principalmente en:

```text
Inicio
Planificación
```

No dentro de Movimientos hasta que se paguen.

Ejemplo:

```text
Internet
12 ago
$600
Pendiente

Renta
15 ago
$3,000
Pendiente
```

Acciones:

```text
Marcar pagado
Omitir
Editar este pago
Administrar recurrencia
```

## Vencidos

```text
Renta
10 ago
$3,000

⚠ Venció hace 1 día
```

Acciones:

```text
Marcar pagado
Cambiar fecha
Omitir
```

Nunca marcar automáticamente como pagado.

---

# 37. Historial 2.0

No mostrar una lista abstracta de entidades `Period`.

Ejemplo:

```text
Historial

1–15 agosto

Ingresos recibidos   $8,000
Gastos               $5,120
Resultado            $2,880

[ Ver resumen ]
```

No llamar automáticamente `$2,880` “ahorro”.

Usar:

```text
Resultado del periodo
Margen del periodo
```

## Estado analizable

```text
ended
AND
sin pending occurrences
```

## Pendiente de revisión

```text
ended
AND
existe pending occurrence
```

UX:

```text
1–15 agosto

⚠ Pendiente de revisión

Tienes 1 pago sin confirmar.

[ Revisar periodo ]
```

## Detalle

Incluye:

- ingresos recibidos;
- gastos;
- resultado;
- categorías;
- presupuesto;
- pagos recurrentes;
- comparación;
- análisis.

Comparar preferentemente con un periodo anterior equivalente.

---

# 38. Planificación 2.0

Responde:

> **¿Qué podría pasar después?**

Subáreas:

```text
Próximo periodo
Próximos pagos
Ingresos esperados
¿Qué pasa si...?
```

Ejemplo:

```text
16–31 agosto

Saldo inicial proyectado
$3,500

Ingresos esperados
+$8,000

Pagos recurrentes estimados
-$4,200

Proyección
$7,300
```

Todo dato futuro debe utilizar lenguaje:

```text
esperado
estimado
proyectado
```

Nunca presentarlo como hecho.

---

# 39. Futuras recurrencias en Planificación

Para futuro:

```text
RecurringPayment
      ↓
projectRecurringPaymentsForRange()
      ↓
ProjectedRecurringPayment[]
```

Sin persistir occurrences.

Editar la regla puede cambiar futuras proyecciones, pero no occurrences ya generadas.

---

# 40. Ingreso esperado UX

Se crea desde Planificación:

```text
Nómina
15 agosto
$8,000
Esperado
```

Al confirmarse:

```text
MarkIncomeAsReceived
```

sale de esperados y aparece en Movimientos.

---

# 41. ¿Qué pasa si...?

El simulador consume snapshots/proyecciones sin escribir datos reales.

Ejemplo:

```text
¿Qué pasa si gasto $2,000?

Disponible proyectado actual
$4,500

Después de la compra
$2,500

Tus compromisos seguirían cubiertos.
```

No persiste:

```text
Expense
Income
BalanceAnchor
Occurrence
```

---

# 42. Análisis 2.0

Primero mostrar análisis determinista:

```text
Tus gastos bajaron 12%
vs. periodo anterior
```

```text
Alimentación aumentó $430
```

Después, cuando corresponda:

```text
✦ Resumen inteligente
```

## Disponibilidad

Análisis determinista:

```text
offline           ✅
guest             ✅
authenticated     ✅
```

IA:

```text
online            ✅
authenticated     ✅
```

Offline:

> El análisis básico sigue disponible. Conéctate para generar el resumen inteligente.

Guest:

> Inicia sesión para utilizar el resumen inteligente.

La app nunca depende de IA para ser útil.

---

# 43. Onboarding 2.0

Flujo:

```text
Bienvenida
    ↓
Cómo organizas tu dinero
    ↓
Crear periodo actual
    ↓
Saldo actual
    ↓
Ingreso
    ↓
Pagos recurrentes
    ↓
Inicio
```

## Cadencia Core 2.0

```text
Mensual
Quincenal
```

`weekly/custom` queda fuera del Core 2.0 para no ampliar el modelo antes del rediseño.

## Paso obligatorio

Crear periodo actual.

## Saldo

Recomendado pero opcional.

Si se omite:

```text
Saldo actual
No configurado
```

## Saldo inicial

La pregunta:

> ¿Cuánto dinero tienes actualmente disponible?

crea un `BalanceAnchor`.

## Ingreso inicial

Opciones:

```text
Ya lo recibí
→ received

Lo recibiré después
→ expected
```

## Recurrentes

Permitir omitir.

---

# 44. Empty states

## Inicio sin periodo

> Configura tu periodo para comenzar a organizar tus finanzas.

`[ Configurar periodo ]`

## Inicio sin BalanceAnchor

> Configura cuánto dinero tienes ahora para activar tus proyecciones.

`[ Configurar saldo ]`

## Movimientos vacío

> Aún no tienes movimientos.

`[ Registrar movimiento ]`

## Presupuesto vacío

> Define cuánto quieres gastar por categoría.

`[ Crear presupuesto ]`

## Próximos pagos vacío

> Agrega renta, servicios o suscripciones para anticipar tus próximos compromisos.

`[ Agregar pago ]`

## Historial vacío

> Cuando termines tu primer periodo aparecerá aquí.

## Planificación sin periodo futuro

> Crea tu próximo periodo para comenzar a planificar.

## Análisis insuficiente

> Necesitamos más movimientos para mostrar patrones útiles.

---

# 45. Loading states

Lunumia es local-first.

```text
IndexedDB
→ primera fuente
```

Patrón:

```text
datos locales
→ render inmediato

sync remoto
→ actualización no bloqueante
```

No mostrar spinner global esperando Supabase si existen datos locales.

Usar skeleton solo cuando exista carga inicial real.

---

# 46. Offline states

Offline no es un error para las funciones principales.

Debe seguir funcionando:

```text
Movimientos
Presupuesto
Periodos
Historial
Recurrentes locales
Simulador
```

Indicador discreto:

```text
Sin conexión
Los cambios se sincronizarán después.
```

---

# 47. Sync states

Estados visibles:

```text
✓ Sincronizado

↻ Sincronizando

○ Sin conexión

⚠ Error de sincronización
```

Un error de sync no bloquea CRUD local.

---

# 48. Error states

Distinguir conceptualmente:

```text
ValidationError
StorageError
SyncError
NetworkError
AuthError
AIError
OCRFailure
```

Nunca mostrar stacks o excepciones técnicas al usuario.

Cada error debe ofrecer una acción:

```text
Corregir
Reintentar
Continuar offline
Volver
```

---

# 49. Auth UX 2.0

Pantallas:

```text
Iniciar sesión
Crear cuenta
Recuperar contraseña
Verificar correo
Restablecer contraseña
```

Identidad:

```text
Lunumia
Claridad para tus finanzas.
```

Permitir:

```text
Continuar como invitado
```

Explicar beneficios de cuenta:

```text
sincronización
varios dispositivos
IA
recuperación remota
```

---

# 50. Guest → Account UX

Si existen datos guest al iniciar sesión:

> Encontramos datos en este dispositivo.

Opciones:

```text
Combinar datos de este dispositivo con mi cuenta
```

recomendada, y:

```text
Usar los datos de mi cuenta
```

Pero esta segunda opción **no debe borrar automáticamente el dataset guest**.

También:

```text
Cancelar
```

La eliminación local es una acción separada.

---

# 51. Logout

Decisión definitiva:

> **Cerrar sesión no significa eliminar datos locales.**

Separar:

```text
Cerrar sesión
```

de:

```text
Eliminar datos de este dispositivo
```

Nunca ejecutar limpieza destructiva silenciosa si existen operaciones:

```text
pending
processing
error
```

---

# 52. Configuración 2.0

```text
Cuenta

Preferencias financieras

Categorías

Apariencia

Sincronización

Datos y respaldos

Seguridad

Acerca de Lunumia
```

Futuro:

```text
Seguridad
└── Protección de datos locales
    └── Encrypted Local Vault
```

---

# 53. Responsive

Breakpoints iniciales:

```text
Mobile
< 640px

Tablet
640–1023px

Desktop
>= 1024px
```

Debe funcionar desde aproximadamente:

```text
320px
```

sin scroll horizontal global.

## Mobile

```text
Bottom navigation
Cards apiladas
Full-screen forms / bottom sheets
Touch targets >= 44px
Safe-area insets
Teclado no tapa CTA
Tablas → cards/listas
```

## Desktop

```text
Sidebar persistente
Content max-width
Cards en grid
Dialogs
Paneles laterales cuando aporten valor
```

Evitar extender contenido financiero por todo un monitor ultrawide.

---

# 54. PWA UX

Preservar:

```text
Instalable
Offline
UpdatePrompt
OfflineIndicator
Manifest
Service Worker
```

Update prompt:

> Nueva versión disponible.

`[ Actualizar ]`

La actualización no debe poner en riesgo cambios locales pendientes.

---

# 55. Android UX

Contemplar:

```text
safe areas
hardware back
deep links auth
camera permissions
network state
external browser
keyboard
orientation
```

El flujo financiero principal sigue funcionando sin conexión.

---

# 56. OCR UX

Dentro de:

```text
Registrar gasto
```

acción:

```text
Escanear recibo
```

Flujo:

```text
Camera
↓
OCR
↓
Formulario prellenado
↓
Usuario revisa
↓
Guardar
```

Nunca guardar automáticamente sin confirmación.

---

# 57. Accesibilidad

Objetivo:

> **WCAG 2.2 AA**

Requisitos:

```text
Contraste suficiente
Focus visible
Navegación por teclado
Labels asociados
Headings semánticos
ARIA cuando corresponda
No usar solo color
Reduced motion
Touch targets >= 44×44
Zoom sin ruptura
Errores comprensibles
```

## Gráficas

Toda gráfica tiene equivalente textual.

Ejemplo:

```text
Alimentación
$1,200
24% de tus gastos
```

No depender solamente del color o de la forma visual.

---

# 58. Scope definitivo del release

## LUNUMIA 2.0 CORE

Incluye:

```text
Domain 2.0
FinancialSnapshot
PlanningProjection
Nuevo modelo financiero
Design System
Nueva navegación
Inicio
Movimientos
Presupuesto
Próximos pagos
Historial
Planificación
Análisis
Onboarding
System states
Auth/Guest UX
Responsive
Accessibility
PWA UX
Android UX
OCR integration
Regression
Production rollout
```

## LUNUMIA 2.1 CANDIDATE

```text
Plan inteligente de ahorro
Análisis histórico avanzado
Metas inteligentes
```

## SECURITY EXTENSION 2.x

```text
Encrypted Local Vault
```

## WEB / MARKETING

```text
lunumia.com → landing pública
app.lunumia.com → PWA
```

El split de dominio/landing no bloquea `LUNUMIA 2.0 COMPLETE`.

---

# 59. Plan Inteligente de Ahorro — roadmap

Fuera del Core 2.0.

Condición inicial:

```text
>= 3 periodos analizables
```

Motor determinista:

```text
ingreso promedio
gasto promedio
margen promedio
variabilidad
tendencias
```

Produce:

```text
Conservador
Equilibrado
Intensivo
```

La IA explica. No decide ni calcula los montos críticos.

---

# 60. Encrypted Local Vault — roadmap

Fuera del Core 2.0.

Arquitectura futura:

```text
Vault passphrase
→ KDF versionado
→ KEK
→ DEK aleatoria
→ AES-256-GCM
→ datos locales cifrados
```

No mezclar en el mismo ciclo:

```text
Domain migration
+
UX redesign
+
cryptographic storage migration
```

---

# 61. DOMAIN 2.0 — proceso completo

```text
DOMAIN 2.0

D0  Baseline
 │
D1  Domain types
 │
D2  Domain tests
 │
D3  Supabase additive migration
 │
 ├── CHECKPOINT A
 │
D4  Dexie migration
 │
 ├── CHECKPOINT B
 │
D5  Repositories
 │
D6  Sync protocol
 │
 ├── CHECKPOINT C
 │
D7  Use cases
 │
D8  FinancialSnapshot + PlanningProjection
 │
D9  Property tests
 │
D10 GetFinancialSnapshot
 │
D11 Migrate existing calculators
 │
D12 Simulator
 │
D13 AI contracts
 │
D14 Backup schema
 │
D15 Regression + Security
 │
D16 Production rollout
 │
 └── DOMAIN 2.0 COMPLETE
```

Cada `D` se ejecuta como una unidad independiente con:

```text
prompt
→ implementación
→ tests
→ reporte
→ revisión
→ commit
```

No usar un único prompt para D0–D16.

---

# 62. D0 — Baseline

## Objetivo

Crear una fotografía técnica verificable antes de modificar contratos o persistencia.

## Inspeccionar

```text
src/domain/
src/application/
src/infrastructure/local/
src/infrastructure/remote/
src/infrastructure/sync/
src/**/backup*
src/**/import*
src/**/export*
supabase/migrations/
supabase/functions/
tests/
package.json
```

Localizar:

```text
Period
Income
Expense
RecurringPayment
RecurringPaymentOccurrence
CategoryBudget
Money
SyncableEntity

CreateIncome
CreateExpense
GenerateOccurrencesForPeriod
MarkOccurrenceAsPaid

Dexie schema
repositories
Supabase mappers
sync serializers
backup schema
AI contracts
simulator calculator
dashboard calculators
```

## Baseline

Ejecutar los scripts reales existentes:

```text
format:check
lint
typecheck
test:run
build
```

Registrar:

- branch/commit;
- cantidad de tests;
- errores previos;
- warnings;
- versión Dexie;
- última migración Supabase;
- divergencias con este documento.

## Prohibido

```text
NO contratos nuevos.
NO SQL.
NO Dexie migration.
NO sync.
NO UI.
```

---

# 63. D1 — Domain types

Agregar:

```text
IncomeStatus
BalanceAnchor
Income.affectsBalance
Income.balanceEffectiveAt
Expense.affectsBalance
Expense.balanceEffectiveAt
RecurringPaymentOccurrence.amount
PeriodTemporalState
FinancialSnapshot contract
PlanningProjection contract
```

Helpers puros:

```text
resolveCurrentPeriod()
getPeriodTemporalState()
isOccurrenceOverdue()
isExpectedIncomeOverdue()
isPeriodAnalyzable()
```

No modificar persistencia todavía.

---

# 64. D2 — Domain tests

Congelar reglas mediante tests.

Cubrir:

```text
BalanceAnchor positivo/cero/negativo
sin BalanceAnchor
Income expected/received/cancelled
balanceEffectiveAt
affectsBalance
period resolver
movement date ↔ period
pending/paid/skipped
overdue committed
overdue expected
occurrence amount snapshot
paid occurrence invariant
planning projection sin persistencia
```

D2 congela contratos; no implementa todavía todo el motor final.

---

# 65. D3 — Supabase additive migration

## Nueva tabla

```text
balance_anchors
```

Campos:

```text
id
user_id
amount
captured_at
ledger_cutoff_at
created_at
updated_at
deleted_at
```

## Incomes

Agregar:

```text
status
affects_balance
balance_effective_at
```

Backfill legacy:

```text
status = received
affects_balance = true
balance_effective_at = created_at
```

Luego constraints:

```text
status NOT NULL
CHECK expected|received|cancelled
affects_balance NOT NULL
```

`balance_effective_at` puede ser nullable porque `expected/cancelled` no son efectivos.

## Expenses

Agregar:

```text
affects_balance
balance_effective_at
```

Backfill:

```text
affects_balance = true
balance_effective_at = created_at
```

Después `NOT NULL` cuando el backfill esté validado.

## Occurrences

Agregar:

```text
amount
```

Primero nullable.

Backfill:

```text
recurring_payment_occurrences.recurring_payment_id
→ recurring_payments.amount
```

Validar:

```text
0 NULL
```

Luego:

```text
NOT NULL
CHECK amount > 0
```

## RLS

`balance_anchors`:

```text
TO authenticated
auth.uid() = user_id
```

para SELECT/INSERT/UPDATE/DELETE.

## Delete account

Actualizar todos los flujos explícitos que enumeren tablas.

## Prohibido

```text
NO Dexie.
NO UI.
NO Dashboard 2.0.
NO Vault.
```

---

# 66. CHECKPOINT A — Supabase

Validar:

```text
balance_anchors
RLS A/B
cross-user isolation
Income backfill
Expense backfill
Occurrence amount backfill
balance_effective_at
constraints
indexes
delete account
datos legacy intactos
no destructive DDL
```

No continuar a D4 hasta estar verde.

---

# 67. D4 — Dexie migration

Incrementar versión local.

Conservar el nombre técnico actual de IndexedDB.

Agregar:

```text
balanceAnchors
```

Migrar:

```text
Income.status ?? received
Income.affectsBalance ?? true
Income.balanceEffectiveAt ?? createdAt

Expense.affectsBalance ?? true
Expense.balanceEffectiveAt ?? createdAt

Occurrence.amount
→ desde RecurringPayment
```

No crear BalanceAnchor automáticamente.

Si falta el padre de una occurrence:

```text
NO amount=0
NO continuar silenciosamente
```

Migración transaccional/interruption-safe.

---

# 68. CHECKPOINT B — Local Storage

Validar:

```text
upgrade
legacy data
guest
authenticated
offline
reload
soft deletes
occurrence amount
balanceEffectiveAt
no anchor inventado
fallo recuperable
```

---

# 69. D5 — Repositories

Crear `IBalanceAnchorRepository`:

```ts
interface IBalanceAnchorRepository {
  create(anchor: BalanceAnchor): Promise<BalanceAnchor>
  findLatest(): Promise<BalanceAnchor | null>
  findAll(): Promise<BalanceAnchor[]>
}
```

Actualizar repositorios para nuevos campos.

Asegurar:

```text
owner isolation
soft-delete filters
latest anchor deterministic
expected/received queries
pending occurrence queries
```

---

# 70. D6 — Sync protocol

Agregar:

```text
balanceAnchor
```

al registry de sync.

Sincronizar:

```text
Income.status
Income.affectsBalance
Income.balanceEffectiveAt

Expense.affectsBalance
Expense.balanceEffectiveAt

Occurrence.amount
```

Actualizar:

```text
mappers
serializers
reconcilers
entity registries
guest-to-user migration
whitelists
```

Compatibilidad temporal:

```text
legacy Income → received/true/createdAt
legacy Expense → true/createdAt
```

Nunca fallback:

```text
Occurrence.amount = 0
```

## Multi-device anchor

Anchor vigente:

```text
capturedAt DESC
updatedAt DESC
id DESC
```

Mantener anchors históricos.

## Recurrent paid invariant

Retries no producen dos expenses para una occurrence.

---

# 71. CHECKPOINT C — Sync

Validar:

```text
Web ↔ Supabase
Android ↔ Supabase
offline → online
BalanceAnchor
new fields
guest migration
retry
conflict
multi-device
cross-user
no duplicate recurring expense
```

---

# 72. D7 — Use cases

Implementar:

```text
SetCurrentBalance
ReconcileCurrentBalance
CreateExpectedIncome
MarkIncomeAsReceived
CancelExpectedIncome
```

Actualizar:

```text
CreateIncome
UpdateIncome
DeleteIncome
CreateExpense
UpdateExpense
DeleteExpense
GenerateOccurrencesForPeriod
MarkOccurrenceAsPaid
MarkOccurrenceAsSkipped
```

## SetCurrentBalance

```text
BalanceAnchor.amount = input
capturedAt = now
ledgerCutoffAt = now
```

No crear Income.

## CreateIncome normal

```text
status=received
affectsBalance=true
balanceEffectiveAt=now
```

## CreateExpectedIncome

```text
status=expected
balanceEffectiveAt=null
```

## MarkIncomeAsReceived

```text
expected → received
balanceEffectiveAt=now
```

idempotente.

## Histórico

Permitir:

```text
affectsBalance=false
```

## GenerateOccurrences

```text
Occurrence.amount = RecurringPayment.amount
```

## MarkOccurrenceAsPaid

```text
actualAmountCents ?? occurrence.amount
```

Crea `Expense` vinculado y actualiza occurrence de forma atómica.

## Delete linked recurring expense

```text
soft-delete expense
+
paid → pending
```

atómicamente.

---

# 73. D8 — FinancialSnapshot + PlanningProjection

Crear funciones puras:

```text
calculateFinancialSnapshot()
calculatePlanningProjection()
projectRecurringPaymentsForRange()
resolveCurrentPeriod()
```

Sin:

```text
React
Dexie
Supabase
IA
I/O
```

`calculateFinancialSnapshot()` implementa las fórmulas de las secciones 14–22.

`calculatePlanningProjection()` implementa futuro sin crear occurrences persistidas.

---

# 74. D9 — Property tests

Propiedades mínimas:

## P1 — Pago exacto conserva disponible proyectado

Si:

```text
actualAmount = occurrence.amount
```

entonces pagar un compromiso ya contemplado:

```text
ProjectedAvailableBefore
=
ProjectedAvailableAfter
```

si nada más cambia.

## P2 — Pago diferente cambia solo por la diferencia

Si:

```text
actual = planned + delta
```

la proyección posterior cambia por `-delta`.

## P3 — Expected → Received conserva cierre proyectado

Si llega exactamente el ingreso previsto:

```text
ProjectedClosingBefore
=
ProjectedClosingAfter
```

sin otros cambios.

## P4 — Budget independence

Cambiar presupuesto no modifica saldo/committed/projected.

## P5 — Historical movement

`affectsBalance=false`:

```text
sí afecta spent/history
no currentBalance
```

## P6 — Snapshot immutability

Editar la regla no modifica occurrence existente.

## P7 — Anchor reset

Nuevo anchor `X` produce saldo `X` antes de nuevos movimientos efectivos.

## P8 — Overdue subset

```text
overdueCommitted <= committed
```

## P9 — Tombstone invariance

Entidades soft-deleted no cambian snapshot.

## P10 — Non-negative aggregates

```text
spent >= 0
committed >= 0
upcomingCommitted >= 0
overdueCommitted >= 0
expectedIncome >= 0
overdueExpectedIncome >= 0
```

Saldo/proyecciones sí pueden ser negativas.

## P11 — Future projection no persiste

Calcular planificación no modifica inputs ni genera entidades persistentes.

## P12 — Paid invariant

Una occurrence pagada nunca debe producir más de un gasto activo.

---

# 75. D10 — GetFinancialSnapshot

Caso de uso:

```text
GetFinancialSnapshot
        │
        ├── periods
        ├── latest anchor
        ├── incomes
        ├── expenses
        └── occurrences
               ↓
      resolveCurrentPeriod
               ↓
      calculateFinancialSnapshot
               ↓
        FinancialSnapshot
```

No escribe datos.

Casos:

```text
sin periodo
sin anchor
periodo vacío
solo gastos
solo expected
solo overdue
```

---

# 76. D11 — Migrate existing calculators

Auditar:

```text
Dashboard
hooks/selectors
period summaries
Insights
Simulator
budget widgets
recurring widgets
analytics
```

Clasificar:

```text
A. Reemplazar por FinancialSnapshot/PlanningProjection
B. Conservar como métrica específica
C. Eliminar por duplicado
```

Objetivo:

```text
una fórmula de currentBalance
una fórmula de committed
una fórmula de projectedAvailable
una semántica de expected income
```

---

# 77. D12 — Simulator

Consumir:

```text
FinancialSnapshot
```

y, cuando aplique:

```text
PlanningProjection
```

No persistir movimientos.

Casos:

```text
sin anchor
compromisos existentes
purchase > projected available
purchase = projected available
purchase dentro/excede presupuesto
```

---

# 78. D13 — AI contracts

Análisis histórico:

```text
Income.received          ✅
Expense                  ✅
Income.expected          ❌
Income.cancelled         ❌
```

Planificación:

```text
expectedIncome           ✅
committed/projections    ✅
```

siempre como agregados calculados.

Actualizar:

```text
provider interfaces
Edge Function contract si aplica
mocks
fixtures
tests
```

No implementar todavía Plan Inteligente de Ahorro.

---

# 79. D14 — Backup schema

Incrementar:

```text
schemaVersion
```

Incluir:

```text
balanceAnchors
Income.status
Income.affectsBalance
Income.balanceEffectiveAt
Expense.affectsBalance
Expense.balanceEffectiveAt
Occurrence.amount
```

Legacy:

```text
Income → received / true / createdAt
Expense → true / createdAt
Occurrence.amount → recurringPayment.amount
```

No crear BalanceAnchor.

Si occurrence no puede resolver monto:

```text
error explícito
```

No:

```text
amount=0
```

Round-trip tests obligatorios.

---

# 80. D15 — Regression + Security

Ejecutar:

```text
format
lint
typecheck
unit
property
integration
build
```

Validar:

```text
RLS
cross-user isolation
balance_anchors
Dexie migration
guest
auth
offline
sync
logout
delete account
backup
OCR
IA
simulator
PWA
Android
soft deletes
multi-device
```

Comprobar que no se introdujeron:

```text
service_role frontend
secrets
financial production logs
N+1 críticos
```

---

# 81. D16 — Production rollout

Precondiciones:

```text
CHECKPOINT A ✅
CHECKPOINT B ✅
CHECKPOINT C ✅
D7–D15 ✅
backup ✅
rollback conocido ✅
```

Orden:

```text
1. Congelar release candidate
2. Backup producción
3. Supabase migration
4. Verificar schema
5. RLS A/B
6. Edge Functions si aplica
7. Frontend compatible
8. Dexie upgrade en primer arranque
9. Usuario legacy
10. Usuario nuevo
11. Guest
12. Offline → online
13. Android
14. PWA
15. Backup round-trip
16. IA / OCR / Simulator
17. Monitorear sync/migration errors
```

Rollback:

- no borrar columnas nuevas apresuradamente;
- no hacer DOWN destructivo sin auditoría;
- permitir rollback de frontend compatible;
- preservar `balance_anchors`.

---

# 82. DOMAIN 2.0 COMPLETE

Solo cuando:

```text
D0  Baseline                       ✅
D1  Domain types                   ✅
D2  Domain tests                   ✅
D3  Supabase additive migration    ✅
A   Checkpoint A                   ✅
D4  Dexie migration                ✅
B   Checkpoint B                   ✅
D5  Repositories                   ✅
D6  Sync protocol                  ✅
C   Checkpoint C                   ✅
D7  Use cases                      ✅
D8  FinancialSnapshot/Planning     ✅
D9  Property tests                 ✅
D10 GetFinancialSnapshot           ✅
D11 Existing calculators migrated  ✅
D12 Simulator                      ✅
D13 AI contracts                   ✅
D14 Backup schema                  ✅
D15 Regression + Security          ✅
D16 Production rollout             ✅
```

Después comienza la ejecución visual de UX 2.0.

---

# 83. UX 2.0 — proceso completo

```text
UX 2.0

U0  Current UI audit
 │
U1  Lunumia Design System
 │
U2  App shell + navigation
 │
 ├── CHECKPOINT UX-A
 │
U3  Inicio / Dashboard
 │
U4  Movimientos
 │
U5  Presupuesto
 │
U6  Próximos pagos
 │
U7  Historial
 │
U8  Planificación
 │
U9  Análisis
 │
 ├── CHECKPOINT UX-B
 │
U10 Onboarding
 │
U11 Empty / Loading / Error / Offline
 │
U12 Settings / Auth / Guest UX
 │
U13 Responsive + PWA + Android
 │
U14 Accessibility
 │
U15 UX Regression
 │
U16 Production rollout
 │
 └── UX 2.0 COMPLETE
```

Cada `U` también debe tener prompt, revisión, tests y commit independientes.

---

# 84. U0 — Current UI audit

Inspeccionar:

```text
rutas
layouts
componentes
formularios
hooks
CSS/tokens
desktop
tablet
mobile
Android
empty states
auth
guest migration UI
offline/sync UI
```

Mapear cada vista legacy contra el Feature Mapping.

No rediseñar todavía.

---

# 85. U1 — Lunumia Design System

Implementar:

```text
brand tokens
semantic tokens
light/dark/system
typography
spacing
radius
motion
focus
buttons
inputs
cards
rows
dialogs
bottom sheets
drawers
states
charts
```

Validar contraste AA antes de declarar estable el sistema.

---

# 86. U2 — App shell + navigation

Implementar:

```text
desktop sidebar
tablet rail
mobile bottom navigation
Más menu
route mapping
legacy redirects
quick add
safe areas
```

## CHECKPOINT UX-A

Validar:

```text
light/dark/system
desktop
tablet
mobile
route compatibility
keyboard navigation
focus
no broken deep links
```

---

# 87. U3 — Inicio / Dashboard

Implementar:

```text
Saldo actual
Gastado
Comprometido
Disponible proyectado
Overdue warning
Periodo actual
Presupuesto utilizado
Próximos pagos
```

Usar exclusivamente `GetFinancialSnapshot`.

Estados:

```text
normal
sin anchor
sin periodo
empty
offline
sync error
```

---

# 88. U4 — Movimientos

Implementar:

```text
Todos
Gastos
Ingresos recibidos
crear
editar
eliminar
histórico / affectsBalance
OCR entry
```

No mostrar `expected` como movimiento realizado.

---

# 89. U5 — Presupuesto

Implementar:

```text
por categoría
actual editable
futuro editable
pasado read-only
normal/cerca/excedido
```

No mezclar saldo ni comprometido.

---

# 90. U6 — Próximos pagos

Implementar:

```text
pending
overdue
paid action
skip
change due date
edit occurrence
manage recurrence
actual amount
```

Vive principalmente en Inicio/Planificación.

---

# 91. U7 — Historial

Implementar:

```text
period cards
resultado
analizable
pendiente de revisión
detalle
comparación equivalente
categorías
presupuesto
análisis
```

No llamar “ahorro” automáticamente al margen.

---

# 92. U8 — Planificación

Implementar:

```text
future period
PlanningProjection
expected incomes
projected recurring payments
¿Qué pasa si...?
```

Todo futuro claramente marcado como:

```text
esperado
estimado
proyectado
```

---

# 93. U9 — Análisis

Implementar primero:

```text
deterministic analytics
```

Después:

```text
AI explanation
```

Manejar:

```text
offline
guest
auth
AI error
insufficient data
```

## CHECKPOINT UX-B

Prueba de comprensión:

> **El usuario puede explicar cuánto tiene, cuánto ha gastado, qué debe pagar y cuánto le quedaría.**

---

# 94. U10 — Onboarding

Implementar flujo definido en sección 43.

Debe:

- explicar propósito;
- crear periodo actual;
- ofrecer BalanceAnchor;
- distinguir ingreso recibido/esperado;
- permitir omitir recurrentes;
- terminar con Inicio útil.

---

# 95. U11 — System states

Sistematizar:

```text
Empty
Loading
Error
Offline
Syncing
Synced
Sync error
No period
No anchor
Insufficient analysis
```

Usar componentes compartidos; no soluciones distintas por pantalla.

---

# 96. U12 — Settings / Auth / Guest UX

Implementar:

```text
login/register/recovery
continue guest
guest → account merge
logout
local data deletion
sync settings
categories
appearance
backups
security placeholder
about
```

Cerrar sesión ≠ eliminar datos locales.

---

# 97. U13 — Responsive + PWA + Android

Validar:

```text
320px+
mobile
tablet
desktop
safe areas
keyboard
hardware back
deep links
camera
offline
install prompt
update prompt
PWA standalone
Android
```

No depender de conexión para CRUD financiero principal.

---

# 98. U14 — Accessibility

Objetivo:

```text
WCAG 2.2 AA
```

Validar:

```text
contrast
keyboard
focus
labels
headings
ARIA
touch targets
reduced motion
zoom
charts text alternative
errors
```

---

# 99. U15 — UX Regression

Probar end-to-end:

```text
guest
auth
offline
sync
CRUD
historical movement
budget
payments
history
planning
analysis
OCR
AI
backup
PWA
Android
responsive
accessibility
```

Realizar también prueba de comprensión/usabilidad.

---

# 100. U16 — UX Production rollout

Precondiciones:

```text
DOMAIN 2.0 COMPLETE
CHECKPOINT UX-A
CHECKPOINT UX-B
U10–U15 verdes
```

Rollout controlado con smoke tests en:

```text
desktop
mobile web
PWA
Android
guest
authenticated
offline
```

---

# 101. LUNUMIA 2.0 COMPLETE

Lunumia 2.0 se considera completa solo cuando:

```text
DOMAIN 2.0 COMPLETE ✅
UX 2.0 COMPLETE     ✅
```

Y un usuario nuevo puede entender en aproximadamente 30 segundos:

> **“Lunumia me muestra cuánto tengo, cuánto estoy gastando y cuánto puedo usar considerando lo que todavía tengo que pagar.”**

Después de acumular historial:

> **“También me ayuda a entender mis hábitos y planificar lo que viene.”**

---

# 102. Orden global del proyecto

```text
PRODUCT DEFINITION
        ↓
FEATURE MAPPING
        ↓
FINANCIAL FORMULAS & STATES
        ↓
DOMAIN SPECIFICATION
        ↓
DOMAIN 2.0 D0–D16
        ↓
DOMAIN 2.0 COMPLETE
        ↓
DESIGN SYSTEM
        ↓
UX 2.0 U0–U16
        ↓
UX 2.0 COMPLETE
        ↓
LUNUMIA 2.0 COMPLETE
```

Después:

```text
Lunumia 2.1
→ Plan inteligente de ahorro

Security 2.x
→ Encrypted Local Vault

Web/Marketing
→ lunumia.com landing
→ app.lunumia.com
```

---

# 103. Estrategia de prompts y commits

No ejecutar grandes bloques de una sola vez.

Patrón:

```text
Prompt D0
→ reporte
→ revisión
→ commit

Prompt D1
→ reporte
→ revisión
→ commit

...

Prompt U16
→ smoke tests
→ release
```

Commits deben ser pequeños, descriptivos y reversibles.

Ejemplos:

```text
chore: capture Lunumia 2.0 domain baseline
feat(domain): add Lunumia 2.0 financial contracts
test(domain): define Lunumia 2.0 behavior
feat(db): add Lunumia 2.0 Supabase schema
feat(local): migrate Dexie to Domain 2.0
feat(sync): support Domain 2.0 entities
feat(domain): add financial snapshot engine
refactor(finance): unify financial calculators
feat(design): add Lunumia 2.0 design system
feat(nav): add responsive Lunumia navigation
feat(dashboard): add Lunumia 2.0 financial overview
feat(planning): add financial planning experience
test: complete Lunumia 2.0 regression
release: roll out Lunumia 2.0
```

---

# 104. Decisiones congeladas

| Decisión | Estado |
|---|---|
| `Period` se conserva internamente | ✅ |
| Current period se resuelve por fecha | ✅ |
| `activePeriodId` no define semánticamente “hoy” | ✅ |
| Movimiento debe pertenecer al periodo de su fecha | ✅ |
| `Expense` representa gasto realizado | ✅ |
| `Income` usa expected / received / cancelled | ✅ |
| `BalanceAnchor` es fuente del saldo base | ✅ |
| Balance puede ser negativo | ✅ |
| `createdAt` no es momento financiero | ✅ |
| `balanceEffectiveAt` define impacto temporal en balance | ✅ |
| `affectsBalance` evita doble conteo | ✅ |
| Comprometido incluye vencidos anteriores | ✅ |
| Expected vencido se deriva y no entra automáticamente en proyección | ✅ |
| Occurrence guarda snapshot de monto | ✅ |
| Pago real puede diferir del monto comprometido | ✅ |
| Paid occurrence requiere un gasto activo | ✅ |
| Eliminar gasto recurrente revierte occurrence a pending | ✅ |
| Futuro recurrente se proyecta sin persistir occurrences | ✅ |
| `overdue` es derivado | ✅ |
| `Expense.recurringOccurrenceId` es vínculo autoritativo | ✅ |
| No reintroducir `transactionId` | ✅ |
| Presupuesto no afecta saldo | ✅ |
| Simulaciones no escriben datos reales | ✅ |
| IA no calcula montos críticos | ✅ |
| Offline es estado normal, no error global | ✅ |
| Logout no elimina datos locales | ✅ |
| Movimientos solo contiene hechos realizados | ✅ |
| Planificación contiene expected/proyectado | ✅ |
| Light/Dark/System forman parte del Design System | ✅ |
| WCAG 2.2 AA es objetivo de accesibilidad | ✅ |
| Plan inteligente queda fuera del Core 2.0 | ✅ |
| Encrypted Local Vault queda fuera del Core 2.0 | ✅ |
| Landing no bloquea Lunumia 2.0 | ✅ |

---

# 105. Estado de cobertura

| Área | Estado |
|---|---|
| Visión de Lunumia | ✅ Cerrada |
| Modelo Hoy / Pasado / Futuro | ✅ Cerrado |
| Feature Mapping | ✅ Cerrado |
| Periodos | ✅ Cerrado |
| Dashboard semantics | ✅ Cerrado |
| Financial formulas | ✅ Cerradas |
| Estados de pagos | ✅ Cerrados |
| Estados de ingresos | ✅ Cerrados |
| BalanceAnchor | ✅ Cerrado |
| balanceEffectiveAt | ✅ Cerrado |
| affectsBalance | ✅ Cerrado |
| Snapshot recurrente | ✅ Cerrado |
| Horizonte de compromisos | ✅ Cerrado |
| Expected overdue | ✅ Cerrado |
| Current period resolver | ✅ Cerrado |
| FinancialSnapshot | ✅ Cerrado |
| PlanningProjection | ✅ Cerrado |
| Supabase | ✅ Planificado |
| Dexie | ✅ Planificado |
| Repositories | ✅ Planificados |
| Sync | ✅ Planificado |
| Use Cases | ✅ Planificados |
| Property tests | ✅ Planificados |
| Calculadores legacy | ✅ Planificados |
| Simulador | ✅ Especificado |
| IA actual | ✅ Especificada |
| Backups | ✅ Planificados |
| Seguridad/regresión | ✅ Planificada |
| Producción/rollback | ✅ Planificado |
| Design System | ✅ Especificado |
| Navegación desktop/tablet/mobile | ✅ Especificada |
| Movimientos | ✅ Especificados |
| Presupuesto 2.0 | ✅ Especificado |
| Próximos pagos | ✅ Especificados |
| Historial | ✅ Especificado |
| Planificación | ✅ Especificada |
| Análisis | ✅ Especificado |
| Onboarding | ✅ Especificado |
| Empty states | ✅ Especificados |
| Loading states | ✅ Especificados |
| Error states | ✅ Especificados |
| Offline states | ✅ Especificados |
| Sync states | ✅ Especificados |
| Auth UX | ✅ Especificado |
| Guest → account UX | ✅ Especificado |
| Responsive | ✅ Especificado |
| Accessibility | ✅ Especificada |
| PWA UX | ✅ Especificada |
| Android UX | ✅ Especificada |
| OCR UX | ✅ Especificada |
| Content language | ✅ Especificado |
| Plan inteligente de ahorro | 🟡 Lunumia 2.1 |
| Encrypted Local Vault | 🟡 Security 2.x |
| Landing `lunumia.com` | 🔵 Proyecto separado |

---

# 106. Próximo paso

La implementación comienza con:

```text
D0 — Baseline
```

D0 es únicamente auditoría y no modifica el dominio.

Después:

```text
D1 — Domain types
D2 — Domain tests
D3 — Supabase additive migration
CHECKPOINT A
```

Cada fase tendrá un prompt separado ajustado al resultado real de la fase anterior.

---

**Fin del Plan Maestro de Lunumia 2.0 — v0.3**
