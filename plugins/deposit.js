//kasanvx

const axios = require('axios')

const APIKEY = global.rumahotp || process.env.RUMAHOTP_APIKEY
const MIN_DEPOSIT = 2000
const CHECK_INTERVAL = 10000

function userData(id) {
  global.db.data.users[id] ||= {}
  const user = global.db.data.users[id]
  if (typeof user.saldo !== 'number') user.saldo = 0
  if (!user.deposit) user.deposit = null
  return user
}

function rupiah(x) {
  return 'Rp' + Number(x || 0).toLocaleString('id-ID')
}

async function api(path, params = {}) {
  const res = await axios.get(`https://www.rumahotp.com/api${path}`, {
    headers: { 'x-apikey': APIKEY, Accept: 'application/json' },
    params,
    timeout: 30000
  })
  return res.data
}

function base64ToBuffer(dataUri = '') {
  const match = String(dataUri).match(/^data:.*?;base64,(.+)$/)
  return Buffer.from(match ? match[1] : dataUri, 'base64')
}

// ==============================
// HANDLER UTAMA
// ==============================

let handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!APIKEY) return m.reply('❌ API RumahOTP belum diset.')

  global.db.data.depositClaims ||= {}
  const user = userData(m.sender)

  // Tidak ada args → tampil info
  if (!args[0] || isNaN(args[0])) {
    return m.reply(
`╭─── 💳 *DEPOSIT* ───
│
│ Format:
│ ${usedPrefix + command} <nominal>
│
│ Contoh:
│ ${usedPrefix + command} 5000
│
│ Minimal: ${rupiah(MIN_DEPOSIT)}
│
│ Cek status: ketik cekdeposit
╰──────────────────`)
  }

  const nominal = parseInt(args[0])
  if (nominal < MIN_DEPOSIT) return m.reply(`❌ Minimal deposit ${rupiah(MIN_DEPOSIT)}`)

  // Sudah ada deposit pending
  if (user.deposit?.status === 'pending') {
    return m.reply(
`⚠️ *Kamu masih punya deposit pending*

ID    : ${user.deposit.id}
Total : ${rupiah(user.deposit.total)}

Ketik *cekdeposit* untuk cek manual.`)
  }

  await m.reply('⏳ Membuat QRIS...')

  try {
    const res = await api('/v1/deposit/create', { amount: nominal, payment_id: 'qris' })
    if (!res.success || !res.data) return m.reply(`❌ Deposit gagal.\n${res?.error?.message || ''}`)

    const d = res.data
    const total = Number(d?.currency?.total || d.amount || nominal)
    const fee = Number(d?.currency?.fee || 0)
    const diterima = Number(d?.currency?.diterima || nominal)
    const expired = Number(d.expired || 0)
    const buffer = base64ToBuffer(String(d.qr || ''))

    const sent = await conn.sendMessage(m.chat, {
      image: buffer,
      caption:
`╭─── 💳 *DEPOSIT QRIS* ───
│
│ ID      : ${d.id}
│ Bayar   : ${rupiah(total)}
│ Fee     : ${rupiah(fee)}
│ Masuk   : ${rupiah(diterima)}
│ Expired : ${expired ? new Date(expired).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' : '-'}
│
│ Saldo masuk otomatis setelah bayar.
│ Cek manual: ketik *cekdeposit*
╰──────────────────────`
    }, { quoted: m })

    user.deposit = {
      id: String(d.id),
      total, fee, diterima, expired,
      created: Date.now(),
      status: 'pending',
      chat: m.chat,
      msgKey: sent?.key || null
    }

    // Start auto watcher (sekali saja)
    startDepositWatcher()

  } catch {
    return m.reply('❌ Terjadi kesalahan server.')
  }
}

// ==============================
// HANDLER BEFORE (cekdeposit)
// ==============================

handler.before = async (m) => {
  if (!m.text) return
  if (!/^cekdeposit$/i.test(String(m.text).trim())) return
  if (!APIKEY) return

  global.db.data.depositClaims ||= {}
  const user = userData(m.sender)
  if (!user.deposit) return m.reply('ℹ️ Tidak ada deposit pending.')

  try {
    const res = await api('/v1/deposit/get_status', { deposit_id: user.deposit.id })
    if (!res.success || !res.data) return m.reply('❌ Gagal cek deposit.')

    const d = res.data
    const status = String(d.status || '').toLowerCase()

    if (status === 'success') {
      if (global.db.data.depositClaims[user.deposit.id]) {
        user.deposit = null
        return m.reply('⚠️ Deposit ini sudah pernah diklaim.')
      }

      global.db.data.depositClaims[user.deposit.id] = true
      const masuk = Number(user.deposit.diterima || 0)
      const id = user.deposit.id
      user.saldo += masuk

      try {
        if (user.deposit.msgKey) {
          await m.conn.sendMessage(user.deposit.chat || m.chat, { delete: user.deposit.msgKey })
        }
      } catch {}

      user.deposit = null
      return m.reply(
`╭─── ✅ *DEPOSIT BERHASIL* ───
│
│ ID     : ${id}
│ Masuk  : ${rupiah(masuk)}
│ Saldo  : ${rupiah(user.saldo)}
╰──────────────────────`)
    }

    if (status === 'cancel') {
      const id = user.deposit.id
      try {
        if (user.deposit.msgKey) {
          await m.conn.sendMessage(user.deposit.chat || m.chat, { delete: user.deposit.msgKey })
        }
      } catch {}
      user.deposit = null
      return m.reply(`❌ Deposit *${id}* dibatalkan / expired.`)
    }

    return m.reply(`ℹ️ Status deposit: *${status}*`)
  } catch {
    return m.reply('❌ Terjadi kesalahan saat cek deposit.')
  }
}

// ==============================
// AUTO DEPOSIT WATCHER
// ==============================

function startDepositWatcher() {
  if (global.depositWatcherStarted) return
  global.depositWatcherStarted = true

  setInterval(async () => {
    if (!global.conn || !global.db?.data?.users || !APIKEY) return

    global.db.data.depositClaims ||= {}

    for (const jid in global.db.data.users) {
      const u = global.db.data.users[jid]
      if (!u?.deposit || u.deposit.status !== 'pending') continue

      try {
        const st = await api('/v1/deposit/get_status', { deposit_id: u.deposit.id })
        if (!st.success || !st.data) continue

        const data = st.data
        const status = String(data.status || '').toLowerCase()

        if (status === 'success') {
          if (global.db.data.depositClaims[u.deposit.id]) { u.deposit = null; continue }

          global.db.data.depositClaims[u.deposit.id] = true
          u.saldo += Number(u.deposit.diterima || 0)

          try { if (u.deposit.msgKey) await global.conn.sendMessage(u.deposit.chat, { delete: u.deposit.msgKey }) } catch {}

          await global.conn.sendMessage(u.deposit.chat, {
            text:
`╭─── ✅ *DEPOSIT BERHASIL* ───
│
│ ID     : ${u.deposit.id}
│ Masuk  : ${rupiah(u.deposit.diterima)}
│ Saldo  : ${rupiah(u.saldo)}
╰──────────────────────`
          })
          u.deposit = null
          continue
        }

        if (status === 'cancel') {
          try { if (u.deposit.msgKey) await global.conn.sendMessage(u.deposit.chat, { delete: u.deposit.msgKey }) } catch {}
          await global.conn.sendMessage(u.deposit.chat, {
            text: `❌ Deposit *${u.deposit.id}* expired / dibatalkan.`
          })
          u.deposit = null
          continue
        }

        // Fallback: expired tapi status belum update
        if (u.deposit.expired && Date.now() > Number(u.deposit.expired) + 15000) {
          try { if (u.deposit.msgKey) await global.conn.sendMessage(u.deposit.chat, { delete: u.deposit.msgKey }) } catch {}
          await global.conn.sendMessage(u.deposit.chat, {
            text: `⏰ Deposit *${u.deposit.id}* expired.`
          })
          u.deposit = null
        }

      } catch {}
    }
  }, CHECK_INTERVAL)
}

handler.help = ['deposit <nominal>']
handler.tags = ['store']
handler.command = /^(deposit)$/i

module.exports = handler