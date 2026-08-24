# ai-insights

Función autenticada con rutas `suggest-category`, `period-summary`,
`explain-changes` y `planning-analysis`. No persiste solicitudes ni respuestas
y no modifica datos.

El payload canónico de `period-summary` usa `context: "historical"` y sólo
transporta ingresos recibidos, gastos, totales por categoría y gastos
destacados ya calculados. `expected` y `cancelled` no se comunican como ingreso
realizado. `planning-analysis` acepta exclusivamente el contexto `planning` con
`expectedIncomeCents`, `committedCents`, balance, proyecciones, cobertura y
horizonte ya calculados. La respuesta estructurada contiene sólo `summary`,
`observations` y `considerations`; no contiene nuevas cifras financieras.

Los importes estructurados se conservan como integer cents. Los saldos y
proyecciones admiten negativos y `null`; los agregados admiten sólo valores no
negativos. La ruta de planificación rechaza con
`insufficient_planning_context` los hechos críticos desconocidos antes de
invocar al proveedor. No se envían entidades `Income`, occurrences, reglas recurrentes,
metadatos de sync, IDs de operaciones, JWT ni claves internas. Después de
validar con Zod, el proveedor construye de forma determinista un contexto
monetario de presentación en MXN. Groq sólo explica ese contexto ya formateado:
no calcula, decide, persiste ni convierte verdad financiera.

## Configuración local

- `AI_PROVIDER=groq`: selecciona el proveedor real de Groq.
- `GROQ_API_KEY`: secreto privado de Groq configurado en Supabase Secrets.
- `GROQ_MODEL`: identificador del modelo de Groq; no existe un modelo
  hardcodeado en la función.
- `AI_PROVIDER=mock`: proveedor determinista para desarrollo y tests.
- `AI_ENVIRONMENT=local`: el mock solo se permite cuando el valor es exactamente
  `development`, `local` o `test`. Cualquier otro valor, incluido `production`,
  falla de forma segura.
- `AI_TIMEOUT_MS=30000`: entre 1000 y 60000 ms; valores inválidos usan 30000 ms.
- `ALLOWED_ORIGINS`: lista separada por comas, compartida con las otras
  funciones.

Las credenciales públicas de Supabase las inyecta el runtime. `GROQ_API_KEY`
debe configurarse como Supabase Secret y nunca con prefijo `VITE_`. La función
no registra la clave ni las respuestas del proveedor.

Las dependencias externas están fijadas en `deno.json`. Esto permite que Deno
resuelva los imports bare usados también por Vitest, como `zod`, sin cambiar los
imports compatibles con Node.

`PostgresRateLimiter` consume el RPC atómico `consume_rate_limit`. La identidad
se deriva del JWT mediante `auth.uid()` y la política privada de `ai-insights`
limita a 10 solicitudes por 60 segundos y usuario, compartidas entre las cuatro
rutas. El cliente solo puede indicar el alcance allowlisted: no puede elegir el
owner, el máximo ni la ventana. Los contadores no guardan JWT, prompts, payloads
financieros ni respuestas. `InMemoryRateLimiter` permanece únicamente como
utilidad aislada de pruebas.
