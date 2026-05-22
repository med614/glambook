#!/usr/bin/env node
import readline  from 'readline'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PHONE     = process.argv[2] || '+212660443770'
const ENDPOINT  = 'http://localhost:3000/whatsapp/webhook'

// Charger .env
try {
  for (const line of readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim()
  }
} catch {}

// Tuer tout backend existant sur le port 3000
const kill = spawn('pkill', ['-f', 'node index.js'], { stdio: 'ignore' })
await new Promise(r => kill.on('close', r))
await new Promise(r => setTimeout(r, 500))

// Lancer le backend — stdout/stderr pipés directement
const backend = spawn('node', ['index.js'], {
  cwd: __dirname,
  env: { ...process.env, SIMULATE_MODE: '1' },
  stdio: ['ignore', 'inherit', 'inherit'],
})

backend.on('exit', (code) => { console.log(`\nBackend arrêté (${code})`); process.exit(1) })
process.on('SIGINT', () => { backend.kill(); process.exit(0) })

console.log('\n📱 Simulateur WhatsApp — tape ton message (Ctrl+C pour quitter)\n')

// Attendre 2s que le backend démarre
await new Promise(r => setTimeout(r, 2000))

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function ask() {
  rl.question('Toi: ', async (msg) => {
    msg = msg.trim()
    if (!msg) return ask()

    const params = new URLSearchParams({
      From: `whatsapp:${PHONE}`,
      Body: msg,
      To:   'whatsapp:+14155238886',
    })

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      if (!res.ok) console.log(`[HTTP ${res.status}]`)
    } catch {
      console.log('[Connexion refusée — backend pas prêt ?]')
    }

    setTimeout(ask, 500) // petite pause pour laisser le bot répondre
  })
}

ask()
