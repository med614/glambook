import readline from 'readline'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const PHONE = process.argv[2] || '+212660443770'
const WEBHOOK_URL = 'http://localhost:3000/whatsapp/webhook'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const IGNORE = ['Node.js', 'supabase-js', 'dotenv', 'MedSolutions API', 'ngrok', '[WA]', 'tip:']

const backend = spawn('node', ['index.js'], {
  cwd: __dirname,
  env: { ...process.env, SIMULATE_MODE: '1' },
  stdio: ['ignore', 'pipe', 'ignore']
})

backend.stdout.on('data', (data) => {
  const text = data.toString()
  if (IGNORE.some(k => text.includes(k))) return
  process.stdout.write(text)
})

await new Promise(r => setTimeout(r, 2000))

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

console.log(`\n🟢 Simulation WhatsApp — numéro : ${PHONE}`)
console.log(`   Tapez votre message et appuyez sur Entrée`)
console.log(`   Ctrl+C pour quitter\n`)

async function sendMessage(text) {
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: `whatsapp:${PHONE}`, Body: text }).toString()
  })
}

function prompt() {
  rl.question('👤 Vous : ', async (text) => {
    if (!text.trim()) return prompt()
    await sendMessage(text.trim())
    setTimeout(prompt, 1200)
  })
}

prompt()
process.on('SIGINT', () => { backend.kill(); process.exit() })
