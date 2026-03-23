# NPD Planner — Telegram Approval Bot
# NO COLOCAR NI SUBIR AL REPO GITIGNORE
# Para Kimi — leer KIMI_READ_FIRST.md antes de empezar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT — Setup de aprobaciones remotas vía Telegram
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lee KIMI_READ_FIRST.md antes de empezar.

OBJETIVO: Crear un script que los agentes (Kimi, Claude Code) usan para
pedir aprobación remota al desarrollador vía Telegram antes de ejecutar
acciones irreversibles. El desarrollador responde desde el teléfono.

NO toques ningún archivo de la app — esto es solo tooling de desarrollo.

---

## ARCHIVOS A CREAR

### 1. scripts/ask-approval.js

Crear la carpeta `scripts/` si no existe.
Crear el archivo `scripts/ask-approval.js`:

```javascript
const https = require('https')

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID
const question = process.argv[2] || 'Agent needs approval — continue?'

if (!TOKEN || !CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment')
  process.exit(1)
}

function sendMessage(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      chat_id: CHAT_ID,
      text: `🤖 *NPD Planner Agent*\n\n${text}\n\nReply *yes* to approve or *no* to reject.`,
      parse_mode: 'Markdown'
    })
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function getUpdates(offset) {
  return new Promise((resolve, reject) => {
    https.get(
      `https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${offset}&timeout=30`,
      res => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => resolve(JSON.parse(data)))
      }
    ).on('error', reject)
  })
}

async function waitForAnswer() {
  // Limpiar updates anteriores para no procesar respuestas viejas
  let offset = 0
  try {
    const init = await getUpdates(0)
    if (init.result?.length > 0) {
      offset = init.result[init.result.length - 1].update_id + 1
    }
  } catch (_) {}

  console.log('⏳ Waiting for your approval on Telegram...')

  const timeout = setTimeout(() => {
    console.error('⏰ Timeout: no response received in 5 minutes — aborting')
    process.exit(1)
  }, 5 * 60 * 1000)

  while (true) {
    try {
      const updates = await getUpdates(offset)
      for (const update of updates.result || []) {
        offset = update.update_id + 1
        const text = update.message?.text?.toLowerCase().trim()
        const chatId = String(update.message?.chat?.id)

        if (chatId !== String(CHAT_ID)) continue

        if (['yes', 'si', 'y', 'ok', 'approve'].includes(text)) {
          clearTimeout(timeout)
          console.log('✅ Approved — continuing')
          process.exit(0)
        }
        if (['no', 'n', 'reject', 'cancel'].includes(text)) {
          clearTimeout(timeout)
          console.log('❌ Rejected — stopping')
          process.exit(1)
        }
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 2000))
  }
}

;(async () => {
  try {
    await sendMessage(question)
    await waitForAnswer()
  } catch (err) {
    console.error('Telegram error:', err.message)
    process.exit(1)
  }
})()
```

---

### 2. .env — agregar variables

Abrir el archivo `.env` (NO el .env.example) y agregar AL FINAL:
```
TELEGRAM_BOT_TOKEN=PEDIR_AL_DESARROLLADOR
TELEGRAM_CHAT_ID=5704067919
```

IMPORTANTE: El desarrollador debe agregar su TELEGRAM_BOT_TOKEN manualmente.
No pongas un token inventado. Deja TELEGRAM_BOT_TOKEN=PEDIR_AL_DESARROLLADOR
como placeholder.

---

### 3. .env.example — agregar plantilla

Abrir `.env.example` y agregar AL FINAL:
```
# Telegram approval bot (for agent approvals)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here
```

---

### 4. .gitignore — verificar que .env está ignorado

Verificar que `.gitignore` tiene la línea `.env` — si no está, agregarla.
El `.env.example` SÍ debe estar en git (no ignorarlo).

---

### 5. KIMI_READ_FIRST.md — agregar sección de aprobaciones

Abrir `KIMI_READ_FIRST.md` y agregar esta sección AL FINAL:

```markdown
## APROBACIONES REMOTAS VÍA TELEGRAM

Antes de ejecutar acciones irreversibles, pide aprobación con:
```
node scripts/ask-approval.js "Describe exactamente qué vas a hacer"
```

Acciones que SIEMPRE requieren aprobación:
- Eliminar archivos o carpetas del proyecto
- Modificar `firestore.rules`
- Cambiar tipos existentes en `types/index.ts` que rompan código ya funcionando
- Cualquier migración de datos en Firestore
- Borrar colecciones o documentos de Firestore

Si el script retorna código 0 → aprobado, continúa.
Si el script retorna código 1 → rechazado, detente y reporta al desarrollador.
Si falla por timeout (5 min sin respuesta) → también detente.
```

---

## CHECKLIST DE VERIFICACIÓN

- [ ] Carpeta `scripts/` creada con `ask-approval.js` dentro
- [ ] `.env` tiene `TELEGRAM_CHAT_ID=5704067919` y `TELEGRAM_BOT_TOKEN=PEDIR_AL_DESARROLLADOR`
- [ ] `.env.example` tiene las dos variables como plantilla
- [ ] `.gitignore` tiene `.env` (verificar, no duplicar si ya existe)
- [ ] `KIMI_READ_FIRST.md` tiene la sección de aprobaciones al final
- [ ] NO modificaste ningún archivo de la app (src/, types/, components/, etc.)
- [ ] git add solo los archivos modificados (scripts/ask-approval.js, .env.example, KIMI_READ_FIRST.md)
- [ ] NO hacer git add de .env

Commit:
"chore: add Telegram approval script for agent actions

- scripts/ask-approval.js — sends message to dev phone, waits for yes/no
- 5 minute timeout auto-rejects if no response
- KIMI_READ_FIRST.md updated with approval workflow
- .env.example updated with Telegram variables

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

---

## INSTRUCCIÓN FINAL PARA EL DESARROLLADOR

Después de que Kimi termine, el desarrollador debe:
1. Ir a @BotFather en Telegram → /newbot → copiar el token
2. Agregar el token al .env: TELEGRAM_BOT_TOKEN=el_token_que_te_dio_botfather
3. Probar con: node scripts/ask-approval.js "Test de aprobación"
4. Responder "yes" desde el teléfono para verificar que funciona
