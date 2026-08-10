# ai-insights

Función autenticada con rutas `suggest-category`, `period-summary` y
`explain-changes`. No persiste solicitudes ni respuestas y no modifica datos.

Los contratos HTTP de `period-summary` y `explain-changes` conservan los
importes como enteros `AmountCents`. Después de validar el request con Zod, el
proveedor construye de forma determinista un contexto monetario de presentación
en MXN para el MVP. Groq solo recibe ese contexto ya formateado, nunca interpreta
unidades monetarias internas y no realiza cálculos ni conversiones.

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
limita a 10 solicitudes por 60 segundos y usuario, compartidas entre las tres
rutas. El cliente solo puede indicar el alcance allowlisted: no puede elegir el
owner, el máximo ni la ventana. Los contadores no guardan JWT, prompts, payloads
financieros ni respuestas. `InMemoryRateLimiter` permanece únicamente como
utilidad aislada de pruebas.
