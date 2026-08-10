# Project Structure

La estructura sigue arquitectura por capas en el núcleo y agrupación por funcionalidad en la interfaz. Los tests se ubican junto al código que validan cuando resulte práctico.

## Current Layout

```
GastoClaro/ # historical repository folder; product name: Lunumia
├── .kiro/
│   ├── steering/       # Reglas y contexto duradero del proyecto
│   └── specs/          # Requisitos, diseño y tareas por entrega
├── src/
│   ├── domain/         # Entidades, value objects, reglas y contratos
│   ├── application/    # Casos de uso y contratos de aplicación
│   ├── infrastructure/ # Dexie, Supabase y adaptadores externos
│   ├── presentation/   # Rutas, componentes y funcionalidades de UI
│   └── app/            # Composition root y configuración de la aplicación
├── supabase/           # Migraciones y Edge Functions
└── tests/              # Pruebas compartidas y utilidades
```

## Planned Organization

- **Separation of concerns**: Keep UI, business logic, and data layers distinct
- **Feature-based grouping**: Group related files by feature rather than by file type when the project grows
- **Flat where possible**: Avoid deep nesting; prefer shallow directory structures
- **Colocation**: Keep tests next to the code they test

## Naming Conventions

- Folders: `kebab-case`
- Files: Follow the convention of the chosen framework/language
- Components/modules: One primary export per file
