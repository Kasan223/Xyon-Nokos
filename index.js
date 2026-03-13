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
const readline = require('readline')
const config = require('./config')
const { serialize } = require('./lib/message')
const { loadPlugins, findPlugin, getAllPlugins } = require('./lib/loader')
const { isSpam, isWarned, setWarned } = require('./lib/antispam')

// Set API Key RumahOTP
global.rumahotp = config.rumahotp || process.env.RUMAHOTP_APIKEY || ''

// Global db sederhana
global.db = {
  data: {
    users: {},
    deposits: {},
    depositClaims: {}
  }
}

// Load plugins
loadPlugins()

// Auto reload plugin kalau ada perubahan
fs.watch(path.join(__dirname, 'plugins'), function(event, filename) {
  if (filename && filename.endsWith('.js')) {
    console.log('[PLUGIN] ' + filename + ' berubah, reload...')
    loadPlugins()
  }
})

// Helper: input dari terminal
function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  return new Promise(function(resolve) {
    rl.question(prompt, function(answer) {
      rl.close()
      resolve(answer.trim())
    })
  })
}

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
    printQRInTerminal: false,
    browser: ['XyonBot', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
  })

  // Pairing code — hanya request kalau belum terdaftar
  if (!sock.authState.creds.registered) {
    let phoneNumber = config.ownerNumber && config.ownerNumber[0]
      ? config.ownerNumber[0]
      : ''

    if (!phoneNumber) {
      phoneNumber = await question('Masukkan nomor HP (format 628xxx): ')
    }

    phoneNumber = phoneNumber.replace(/[^0-9]/g, '')
    console.log('[' + sessionId + '] Meminta pairing code untuk ' + phoneNumber + '...')

    setTimeout(async function() {
      try {
        const code = await sock.requestPairingCode(phoneNumber)
        console.log('\n============================')
        console.log('  PAIRING CODE: ' + code)
        console.log('============================')
        console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon')
        console.log('Masukkan kode di atas\n')
      } catch (e) {
        console.error('[' + sessionId + '] Gagal minta pairing code:', e.message)
      }
    }, 3000)
  }

  sock.ev.on('connection.update', async function(update) {
    const connection = update.connection
    const lastDisconnect = update.lastDisconnect

    if (connection === 'close') {
      const err = lastDisconnect && lastDisconnect.error
      const code = err && err.output && err.output.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      console.log('[' + sessionId + '] Koneksi putus (' + code + '), reconnect: ' + shouldReconnect)
      if (shouldReconnect) setTimeout(function() { startSession(sessionId) }, 3000)
    }

    if (connection === 'open') {
      console.log('[' + sessionId + '] ✅ Terhubung!')
      global.conn = sock
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async function(upsert) {
    const messages = upsert.messages
    const type = upsert.type
    if (type !== 'notify') return

    for (let i = 0; i < messages.length; i++) {
      const rawMsg = messages[i]
      try {
        if (!rawMsg.message) continue
        if (rawMsg.key.fromMe) continue

        const m = serialize(rawMsg, sock)
        const body = m.body
        const isGroup = m.isGroup
        const sender = m.sender
        const senderNumber = m.senderNumber

        if (!body) continue

        const isOwner = config.ownerNumber.includes(senderNumber)

        // Before handlers (middleware untuk sesi, cekdeposit, dll)
        const allPlugins = getAllPlugins()
        for (let j = 0; j < allPlugins.length; j++) {
          const p = allPlugins[j]
          if (p.before) {
            try {
              await p.before(m, {
                conn: sock,
                args: [],
                usedPrefix: '',
                command: '',
                isGroup,
                sender,
                senderNumber,
                isOwner,
                config
              })
            } catch (e) {
              // silent
            }
          }
        }

        // Anti spam
        if (isSpam(senderNumber)) {
          if (!isWarned(senderNumber)) {
            setWarned(senderNumber)
            await m.reply('Kamu terlalu cepat! Tunggu sebentar.')
          }
          continue
        }

        // Parse command
        const usedPrefix = config.prefix.find(function(p) { return body.startsWith(p) })
        if (!usedPrefix) {
          if (config.autoReply && !isGroup) {
            const lower = body.toLowerCase()
            if (['halo', 'hai', 'hi', 'hello'].some(function(w) { return lower.includes(w) })) {
              await m.reply('Halo! Ketik *' + config.prefix[0] + 'menu* untuk melihat perintah')
            }
          }
          continue
        }

        const args = body.slice(usedPrefix.length).trim().split(/\s+/)
        const command = args.shift().toLowerCase()

        const plugin = findPlugin(command)
        if (!plugin) continue

        if (plugin.ownerOnly && !isOwner) {
          await m.reply('❌ Command ini hanya untuk owner!')
          continue
        }

        if (plugin.groupOnly && !isGroup) {
          await m.reply('❌ Command ini hanya bisa dipakai di grup!')
          continue
        }

        await plugin.handler(m, {
          conn: sock,
          args,
          usedPrefix,
          command,
          isGroup,
          sender,
          senderNumber,
          isOwner,
          config
        })

      } catch (e) {
        console.error('[ERROR]', e.message)
      }
    }
  })

  return sock
}

async function main() {
  console.log('Starting ' + config.botName + '...')
  for (let i = 0; i < config.sessions.length; i++) {
    await startSession(config.sessions[i])
  }
}

main().catch(console.error)
