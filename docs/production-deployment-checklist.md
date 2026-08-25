# Lunumia production deployment checklist

Este documento enumera configuración y controles operativos; nunca debe
contener valores secretos. D16B sólo prepara fuente, configuración y pruebas:
no autoriza escrituras en AWS, Cloudflare, Supabase ni DNS.

## Canonical public origins

| Surface               | Canonical origin          | Contract                                               |
| --------------------- | ------------------------- | ------------------------------------------------------ |
| Marketing             | `https://lunumia.com`     | Landing pública futura                                 |
| WWW                   | `https://www.lunumia.com` | Redirect canónico a marketing                          |
| Web application / PWA | `https://app.lunumia.com` | Aplicación completa en navegador; instalar es opcional |

El cambio es sólo de host. La aplicación no adquiere un prefijo `/app`; sus
rutas siguen siendo `/inicio`, `/movimientos`, `/plan`,
`/plan/proyeccion`, `/plan/presupuestos`, `/plan/compromisos`, `/insights`,
`/simulador`, `/settings`, `/login`, `/register`, `/verify-email` y
`/reset-password`. CloudFront debe resolver directamente cualquier ruta SPA al
`index.html` sin convertir un 403/404 de S3 en una página de error.

El contrato futuro de la landing es:

- **Abrir Lunumia** → `https://app.lunumia.com/`
- **Iniciar sesión** → `https://app.lunumia.com/login`
- **Crear cuenta** → `https://app.lunumia.com/register`

Privacidad, términos, producto y ayuda pertenecen conceptualmente a marketing
en `lunumia.com`, pero no se inventan rutas hasta que la landing las defina.

## Independent landing artifact

La landing vive en `landing/` como Vite vanilla TypeScript/CSS, sin importar
React, Supabase, providers, rutas o Service Worker de la aplicación.

```text
pnpm dev:landing       # desarrollo local
pnpm build:landing     # artefacto de producción
dist-landing/          # salida exclusiva de marketing
```

El build de la app continúa con `pnpm build` hacia `dist/`. Ambos artefactos
son independientes y no deben publicarse en el mismo bucket/prefix.

Cache futuro de landing:

- HTML: `no-cache, max-age=0, must-revalidate`;
- assets con nombre hash: `public, max-age=31536000, immutable`;
- sin Service Worker ni reglas de cache PWA.

La landing implementada localmente no autoriza el cutover. Una futura
comunicación de migración guest/local-only podría vivir en el host antiguo y/o
en la landing, pero sólo después de que Producto acepte el mecanismo.

## PWA and browser behavior

`vite.config.ts` usa `start_url: '/'`, `scope: '/'` y fallback de navegación
`/index.html`, todos relativos. La raíz es deliberadamente el punto seguro:
React Router la resuelve a `/inicio` y conserva las decisiones existentes de
sesión y primera configuración. El manifiesto, el Service Worker y sus caches
quedan ligados al origen que los sirve; no intentan controlar `lunumia.com`
desde `app.lunumia.com`.

La PWA es también la aplicación Web. No hay install wall, descarga obligatoria,
APK ni dependencia de Capacitor para usarla en un navegador normal. Las futuras
instrucciones de instalación deben llevar primero a `app.lunumia.com`, donde el
navegador determina la instalabilidad.

## Supabase Auth

Proyecto esperado: `bitmeeuzbdovysaqwwzk`.

Decisión de **Site URL**: `https://app.lunumia.com`. Lunumia pasa siempre
`emailRedirectTo`/`redirectTo` para los flujos implementados, pero Site URL es
el fallback de Auth y debe resolver al producto, no a la landing de marketing.

La Redirect Allow List de producción debe contener como mínimo, sin wildcards:

- `https://app.lunumia.com/verify-email`
- `https://app.lunumia.com/reset-password`
- `com.gastoclaro.app://auth/callback`

Los dos callbacks Web son las rutas reales del producto. No existe una ruta Web
`/auth/callback` en el router actual. Durante la fase dual-host se conservan
además, sólo mientras esos hosts ejecuten la app:

- `https://lunumia.com/verify-email`
- `https://lunumia.com/reset-password`
- `https://www.lunumia.com/verify-email`
- `https://www.lunumia.com/reset-password`

El cliente Web mantiene `flowType: 'pkce'`, `detectSessionInUrl: true`,
`persistSession: true` y renovación automática. Confirmación y recuperación
calculan el redirect desde `window.location.origin`; en el nuevo host no pueden
caer en la home de marketing. El callback Android histórico permanece separado
y no se modifica.

Revisar las plantillas de Auth/Resend en el cutover. Si una plantilla usa
`SiteURL`, debe reflejar la decisión anterior; si usa el redirect suministrado,
debe respetar el destino exacto. D16B no modifica SMTP, Resend ni plantillas.

## Supabase Edge and transitional CORS

Variables requeridas:

- `AI_PROVIDER`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `OCR_PROVIDER`
- `OCR_MODEL`
- `ALLOWED_ORIGINS`

Variables opcionales con defaults seguros:

- `AI_ENVIRONMENT`
- `AI_TIMEOUT_MS`
- `OCR_ENVIRONMENT`
- `OCR_TIMEOUT_MS`

`ALLOWED_ORIGINS` es canónica. En el rollout Edge-first debe contener
exactamente los orígenes de aplicación aprobados para la transición:

```text
https://lunumia.com,https://www.lunumia.com,https://app.lunumia.com
```

`ALLOWED_ORIGIN` sólo es fallback legacy cuando falta la variable canónica.
El código descarta `*`; un origen desconocido se rechaza. IA y OCR comparten el
mismo contrato. Después de retirar la app antigua del apex/www, eliminar esos
dos orígenes de CORS es hardening post-cutover, nunca un paso previo.

En producción, `AI_PROVIDER=groq` requiere `GROQ_MODEL` y `GROQ_API_KEY`.
`OCR_PROVIDER=groq` requiere `OCR_MODEL` y reutiliza `GROQ_API_KEY`. No existe
selección silenciosa de modelo ni mock en producción.

## Local-first origin migration decision (resolved)

El navegador aísla almacenamiento por origen. Pasar de `lunumia.com` a
`app.lunumia.com` crea almacenamiento nuevo; no migra automáticamente:

| Store                      | Content                                                                                                                     | Migration behavior                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Dexie / `GastoClaroDB`     | periodos, ingresos, gastos, categorías, presupuestos, compromisos/ocurrencias, saldo, preferencias, cola y cursores de sync | No cruza de origen                                                      |
| `localStorage` de Lunumia  | owner invitado y owner activo                                                                                               | No cruza de origen                                                      |
| `localStorage` de Supabase | sesión/token y verificador PKCE por defecto del cliente browser                                                             | No cruza de origen; se espera nuevo login                               |
| Cache Storage              | shell, lazy chunks, iconos y assets PWA                                                                                     | Nuevo cache por origen; no contiene el respaldo financiero autoritativo |
| Service Worker state       | registro/update del shell                                                                                                   | Nuevo registro en `app.lunumia.com`; el SW antiguo no puede controlarlo |
| `sessionStorage`           | no hay persistencia de producto en fuente                                                                                   | Sin impacto identificado                                                |

La aplicación desplegada actualmente no fue liberada al público. El estado
persistido por el navegador bajo `https://lunumia.com` pertenece únicamente a
pruebas controladas. La decisión de producto aceptada es:

```text
LOCAL_ONLY_DATA_DISCARD_ACCEPTED_FOR_CONTROLLED_TEST_ENVIRONMENT
```

El cutover puede descartar deliberadamente IndexedDB/Dexie, estado de producto
en `localStorage`, owner invitado, cola y cursores locales de sincronización,
Cache Storage, estado del Service Worker y la sesión Auth persistida en el
navegador antiguo. No se requiere bridge, exportación/importación, retención del
origen legacy ni migración automática. En `app.lunumia.com` puede ser necesario
autenticarse de nuevo; los datos que ya existan de forma remota continúan bajo
las reglas normales de Auth, RLS y sincronización.

Esta aceptación se limita al estado local de pruebas del origen antiguo. **No
autoriza eliminar usuarios de Supabase, identidades Auth, filas financieras
remotas, cuentas de prueba remotas, Storage ni ningún otro dato del servidor.**
La limpieza remota permanece fuera de alcance y no debe añadirse ningún comando
o script de borrado como parte del cutover.

## Absolute URL audit

| Occurrence                                                      | Classification                 | Decision                                          |
| --------------------------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| `src/shared/constants/web-origins.ts`                           | A/B: contrato canónico         | App en app; marketing en apex; WWW a marketing    |
| `README.md` y este checklist                                    | D: documentación operacional   | Mantener los tres durante transición              |
| `supabase/functions/**.test.ts`                                 | E: fixtures CORS               | Mantener apex/www y agregar app                   |
| `scripts/deploy-production-frontend.ps1`                        | A: alias de app                | Validar `app.lunumia.com` por defecto             |
| `docs/Lunumia_2.0_Plan_Maestro.md`                              | D: arquitectura histórica/plan | Ya distingue landing y PWA; no reemplazar en masa |
| URLs `*.supabase.co`, schemas y fixtures `*.example`/`app.test` | E: endpoints o pruebas         | Sin cambio                                        |

No se encontró un vínculo de producto, cookie con dominio `.lunumia.com`,
canonical SEO ni supuesto de Service Worker fijado al apex. CSP usa `'self'`,
por lo que adopta naturalmente el host que sirve la app.

## AWS application deployment gate

Antes de cualquier escritura se necesitan:

- `ExpectedAccountId`, suministrado por el responsable de producción;
- una identidad o profile AWS autenticado;
- `DistributionId` de la distribución de la app;
- `ExpectedAlias` (default canónico `app.lunumia.com`);
- `Bucket`, `Region`, `Prefix` y `BackupPath` verificados contra el origin S3.

El repositorio no contiene un account ID ni IDs de infraestructura de producción
verificados. No deben inferirse del hostname. La distribución futura de la app
debe tener alias `app.lunumia.com`, certificado TLS válido y fallback SPA. La
distribución actual sólo puede clasificarse como futura landing o futura app
después de discovery autenticado en AWS.

Arquitectura objetivo:

- landing: S3 + CloudFront propios;
- app: S3 + CloudFront propios.

Esto permite deploy, rollback y cache independientes. D16B no crea recursos.

### Cache metadata

AWS/S3 no consume `public/_headers`. El script
`scripts/deploy-production-frontend.ps1` valida identidad, alias y origin S3,
crea un backup sin borrar objetos, aplica metadata y espera la invalidación.
Admite `-WhatIf`; no usar `--delete`.

- `index.html` y fallback SPA: `no-cache, max-age=0, must-revalidate`;
- `sw.js`: `no-cache, max-age=0, must-revalidate`;
- `manifest.webmanifest`: `no-cache, max-age=0, must-revalidate`;
- assets con nombre hash: `public, max-age=31536000, immutable`.

## CloudFront response headers and cookies

La política efectiva de CloudFront debe reproducir el CSP de
`public/_headers`:

```text
default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'
```

No ampliar a `*`. Mantener `X-Frame-Options: DENY`; la landing enlaza a la app
y nunca la inserta en un iframe. Lunumia es una SPA cliente y no configura
cookies propias; Supabase browser persiste la sesión en almacenamiento local.
No ampliar cookies futuras a `.lunumia.com` sólo para compartir subdominios.

HSTS permanece como decisión operacional separada hasta verificar todos los
subdominios.

## DNS target plan (no writes in D16B)

- `lunumia.com` → infraestructura de landing;
- `www.lunumia.com` → landing o redirect canónico a apex;
- `app.lunumia.com` → distribución CloudFront de la app.

## Ordered production cutover

1. verificar identidad y account AWS;
2. descubrir/crear infraestructura de app sólo con autorización;
3. preparar DNS/TLS de `app.lunumia.com`;
4. configurar Edge CORS con apex + WWW + app;
5. configurar Site URL y Redirect Allow List de Supabase para app, callbacks
   transitorios y callback nativo;
6. desplegar IA Edge backward-compatible;
7. desplegar OCR Edge backward-compatible;
8. smoke test del frontend de producción antiguo;
9. desplegar RC2 Web/PWA en `app.lunumia.com`;
10. smoke test de `app.lunumia.com`, incluidas rutas SPA directas;
11. verificar Auth, sync, IA, OCR, manifiesto, Service Worker y uso browser sin
    instalación;
12. registrar que el descarte del estado local de pruebas del origen antiguo ya
    fue aceptado, sin ejecutar limpieza remota;
13. sólo entonces desplegar la landing en `lunumia.com`;
14. establecer el comportamiento canónico de WWW;
15. retirar la app antigua del apex después de verificación y ventana de
    recuperación.

**No reemplazar `lunumia.com` con la landing antes de que la app nueva pase los
smokes de producción. La decisión sobre datos locales ya está resuelta y no
autoriza limpieza remota.**
Durante la fase A, apex sirve la app antigua y app sirve RC2. En fase B, apex y
WWW pasan a marketing y app queda como único origen Web/PWA de largo plazo.
