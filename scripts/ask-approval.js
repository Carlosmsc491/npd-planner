const https = require('https')
const fs = require('fs')
const path = require('path')

// Auto-load .env from project root so callers don't need --env-file
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID
const question = process.argv[2] || 'Agent needs approval — continue?'

if (!TOKEN || !CHAT_ID || TOKEN === 'PEDIR_AL_DESARROLLADOR') {
  console.error('Missing or unconfigured TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID in .env')
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
      res.on('end', () => {
        const parsed = JSON.parse(data)
        if (!parsed.ok) reject(new Error(`Telegram API error: ${parsed.description || JSON.stringify(parsed)}`))
        else resolve(parsed)
      })
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
