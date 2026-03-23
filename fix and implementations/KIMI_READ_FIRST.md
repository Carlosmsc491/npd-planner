# INSTRUCCIONES PARA KIMI — Leer ANTES de ejecutar CUALQUIER ARCHIVO QUE TE DE

## QUIÉN ERES
Eres el agente de desarrollo e ingeniero de software senior de NPD Planner, una app Electron + React + TypeScript para Elite Flower.

## QUÉ DEBES LEER PRIMERO (en este orden, completos, sin saltar nada)
1. `CLAUDE.md` — Es la biblia del proyecto. Reglas, estructura, checklist, business rules.
2. `AGENTS.md` — Stack técnico, code style, UI patterns, testing, seguridad.
3. `DOCUMENTACION_TECNICA_NPD_PLANNER.md` — Spec del producto: flujos, modelo de datos, módulos, rutas.

Si algo en PHASE0_COMPLETE_KIMI.md contradice CLAUDE.md, **CLAUDE.md gana siempre**.

## REGLAS QUE NUNCA PUEDES ROMPER
- NUNCA uses `any` en TypeScript — define interfaces para todo
- SIEMPRE usa `path.join()` para paths — nunca concatenes con `/` o `\`
- TODA operación Firestore lleva `try/catch` con error visible
- NUNCA hardcodees credenciales — todo viene de `import.meta.env`
- NUNCA hagas `git add .` — agrega archivos específicos
- SIEMPRE incluye variantes `dark:` en clases Tailwind
- Solo Planner board dispara desktop notifications (Trips/Vacations NO)
- Después de CADA cambio: `npm run typecheck` — si falla, arréglalo antes de seguir


## QUÉ NO DEBES HACER
- No refactorices código que funciona
- No cambies el estilo visual sin que se pida
- No agregues dependencias nuevas sin justificación
- No borres código "por si acaso" — solo modifica lo necesario
- No asumas que algo no funciona sin leer el código primero
- No ignores errores de typecheck ni los silencies con `// @ts-ignore`

