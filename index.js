// ==============================
// index.js — Main Bot
// ==============================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys')

const pino = require('pino')
const path = require('path')
const fs = require('fs')

const config = require('./config')
const { serialize } = require('./lib/message')
const { loadPlugins, findPlugin } = require('./lib/loader')
const { isSpam, isWarned, setWarned } = require('./lib/antispam')

// Load plugins
loadPlugins()

// Auto reload plugin kalau ada perubahan
fs.watch(path.join(__dirname, 'plugins'), (event, filename) => {
  if (filename?.endsWith('.js')) {
    console.log(`[PLUGIN] ${filename} berubah, reload...`)
    loadPlugins()
  }
})

async function startSession(sessionId) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId)
  fs.mkdirSync(sessionPath, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    printQRInTerminal: true,
    browser: ['XyonBot', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
  })

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      console.log(`[${sessionId}] Koneksi putus (${code}), reconnect: ${shouldReconnect}`)
      if (shouldReconnect) setTimeout(() => startSession(sessionId), 3000)
    }
    if (connection === 'open') console.log(`[${sessionId}] Terhubung!`)
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const rawMsg of messages) {
      try {
        if (!rawMsg.message) continue
        if (rawMsg.key.fromMe) continue

        const m = serialize(rawMsg, sock)
        const { body, from, sender, senderNumber, isGroup } = m

        if (!body) continue

        // Anti spam
        if (isSpam(senderNumber)) {
          if (!isWarned(senderNumber)) {
            setWarned(senderNumber)
            await m.reply('Kamu terlalu cepat! Tunggu sebentar.')
          }
          continue
        }

        // Parse command
        const usedPrefix = config.prefix.find(p => body.startsWith(p))

        if (!usedPrefix) {
          // Auto reply
          if (config.autoReply && !isGroup) {
            const lower = body.toLowerCase()
            if (['halo', 'hai', 'hi', 'hello'].some(w => lower.includes(w))) {
              await m.reply(`Halo! Ketik *${config.prefix[0]}menu* untuk melihat perintah`)
            }
          }
          continue
        }

        const args = body.slice(usedPrefix.length).trim().split(/\s+/)
        const command = args.shift().toLowerCase()

        const plugin = findPlugin(command)
        if (!plugin) continue

        if (plugin.ownerOnly && !config.ownerNumber.includes(senderNumber)) {
          await m.reply('Command ini hanya untuk owner!')
          continue
        }

        if (plugin.groupOnly && !isGroup) {
          await m.reply('Command ini hanya bisa dipakai di grup!')
          continue
        }

        await plugin.handler(m, { args, usedPrefix, command, sock, isGroup, sender, senderNumber, config })

      } catch (e) {
        console.error('[ERROR]', e.message)
      }
    }
  })

  return sock
}

async function main() {
  console.log(`Starting ${config.botName}...`)
  for (const sessionId of config.sessions) {
    await startSession(sessionId)
  }
}

main().catch(console.error)
