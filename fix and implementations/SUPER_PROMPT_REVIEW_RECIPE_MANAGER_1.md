@super# Super Prompt — Revisión Profunda Recipe Manager
# Para: Kimi con acceso al repo NPD-PLANNER y al repo EliteQuote
# Objetivo: Identificar mejoras, gaps y funciones no pensadas

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPER PROMPT — Deep Review: Recipe Manager para flujo real de shows
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## CONTEXTO DE ROLES
Actúas como 4 roles simultáneos:
1. PLANIFICADOR ESTRATÉGICO: Prioriza, define roadmaps, identifica dependencias
2. PROGRAMADOR SENIOR: Evalúa viabilid ad técnica, arquitectura, deuda técnica
3. ANALISTA DE PRODUCTO: Valida comprensión del negocio, usuarios, flujos
4. DISEÑADOR UX/UI SENIOR: Evalúa usabilidad, patrones de diseño, accesibilidad

---

## CONTEXTO DE NEGOCIO (leer con atención)

Este módulo lo usan diseñadores florales de Elite Flower para crear
bouquets para shows grandes y clientes corporativos.

Escenario real de uso:
- 4 personas trabajando simultáneamente
- 100 bouquets (recetas Excel) en una semana
- Cada persona toma recetas, las llena en Excel, las valida y las marca Done
- Hay un supervisor que necesita ver el progreso en tiempo real
- Los proyectos se repiten (Valentine's Day 2025 → Valentine's Day 2026)
- El equipo de ventas entrega una lista Excel con los bouquets aprobados
- Hay deadlines duros: el show es el viernes, no hay extensión posible

---

## ARCHIVOS A LEER ANTES DE EMPEZAR

Lee estos archivos completos en orden:
1. CLAUDE.md — reglas del proyecto NPD Planner
2. RECIPE_MANAGER_SPEC.md — especificación completa del módulo
3. src/renderer/src/types/index.ts — todos los tipos Recipe Manager
4. src/renderer/src/lib/recipeFirestore.ts — operaciones Firestore
5. src/renderer/src/components/recipes/ — todos los componentes ya creados
6. src/renderer/src/hooks/useRecipeFiles.ts — hook principal
7. src/renderer/src/hooks/useRecipeLock.ts — sistema de locks

También lee en el repo EliteQuote (solo para referencia de lógica):
- services/validation_service.py
- services/lock_service.py
- ui/project_window.py

---

## LO QUE DEBES HACER

Analiza TODO el código del módulo Recipe Manager ya implementado
(Prompts 1-5 completados) con el escenario de negocio en mente.

Para cada problema o mejora que encuentres, entrega:

### FORMATO DE RESPUESTA REQUERIDO

Para cada hallazgo:

ROL: [cual de los 4 roles lo detectó]
CATEGORÍA: [Crítico / Importante / Mejora / Nice-to-have]
TÍTULO: [nombre corto del problema o mejora]
PROBLEMA: [qué falta o qué está mal, en términos de negocio]
IMPACTO: [qué pasa en el escenario real si no se resuelve]
SOLUCIÓN PROPUESTA: [qué habría que implementar, con archivos específicos]
ESFUERZO: [Bajo / Medio / Alto]
DEPENDENCIAS: [qué otros prompts o features necesita primero]

---

## ÁREAS ESPECÍFICAS A REVISAR

### 1. Flujo colaborativo (4 personas simultáneas)
- ¿Hay asignación de recetas a personas o es solo quien llega primero?
- ¿Puede el supervisor ver quién está haciendo qué en tiempo real?
- ¿Qué pasa si dos personas intentan claim al mismo tiempo?
- ¿El lock timeout de 300s es suficiente para recetas complejas?
- ¿Hay notificaciones cuando alguien termina una receta?

### 2. Escala (100 recetas, 1 semana)
- ¿La UI escala visualmente para 100 filas en varias carpetas?
- ¿Hay búsqueda y filtros dentro del proyecto?
- ¿Cuántos Firebase reads genera el módulo por hora con 4 usuarios activos?
- ¿El scan de archivos IPC es eficiente para 100+ archivos?
- ¿Hay paginación o virtualización de la lista?

### 3. Deadline y tracking
- ¿Hay fecha de entrega del proyecto?
- ¿El equipo sabe si va a tiempo?
- ¿Hay velocidad calculada (recetas/hora)?
- ¿El supervisor puede ver un resumen sin abrir cada carpeta?

### 4. Reutilización entre proyectos
- ¿Se puede duplicar un proyecto completo?
- ¿Se puede importar desde Excel la lista de bouquets?
- ¿Las reglas de validación se pueden copiar de un proyecto a otro?

### 5. Validación y Mark Done
- ¿Las 11 reglas cubren todos los casos del negocio floral?
- ¿Qué pasa si el Excel tiene celdas con fórmulas que exceljs no puede leer?
- ¿El flujo de 4 fases (Prepare → Review → Apply → Finalize) es claro para el usuario?
- ¿Hay casos donde Mark Done falla silenciosamente?

### 6. UX para el flujo rápido
- ¿Cuántos clicks necesita un diseñador para: abrir receta → editarla → marcarla done?
- ¿Hay atajos de teclado?
- ¿La pantalla muestra suficiente información sin tener que abrir paneles?
- ¿El estado se actualiza en tiempo real sin que el usuario tenga que refrescar?

### 7. Gaps vs EliteQuote original
- ¿Hay algo en EliteQuote que NO fue portado y que el flujo real necesita?
- ¿Hay algo en EliteQuote que SÍ fue portado pero quedó incompleto?
- ¿El modo "Import from Excel" (marcado como Fase 2) es realmente opcional?

### 8. Integración con el resto de NPD Planner
- ¿Las recetas Done aparecen en algún reporte del Analytics de NPD Planner?
- ¿Se puede crear una tarea en un Board de NPD Planner vinculada a un proyecto NPD?
- ¿El dashboard de NPD Planner muestra el progreso de Recipe Manager?

---

## OUTPUT ESPERADO

1. Lista priorizada de hallazgos (Críticos primero)
2. Para cada hallazgo: el formato definido arriba
3. Al final: roadmap sugerido de qué implementar primero dado el escenario real
4. Lista de prompts adicionales necesarios (con título y descripción de 1 línea cada uno)

NO escribas código. Solo análisis y recomendaciones.
NO implementes nada. Solo reporta.

El output debe ser en español.
