//kasanvx

const axios = require('axios')

const APIKEY = global.rumahotp
const PROFIT = 500
const OTP_TIMEOUT = 180000
const CHECK_INTERVAL = 10000

const services = {
  wa: 13, whatsapp: 13,
  tele: 4, telegram: 4,
  gmail: 6, google: 6,
  ig: 16, instagram: 16,
  shopee: 36
}

function userData(id) {
  global.db.data.users[id] ||= {}
  let user = global.db.data.users[id]
  if (typeof user.saldo !== 'number') user.saldo = 0
  if (!user.deposit) user.deposit = null
  if (!user.nokos) user.nokos = null
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

function pickBestPricelist(pricelist = []) {
  return pricelist
    .filter(v => v?.provider_id && Number(v.price) > 0 && v.available !== false)
    .map(v => ({
      provider_id: String(v.provider_id),
      price: Number(v.price || 0),
      rate: Number(v.rate || 0),
      stock: Number(v.stock || 0)
    }))
    .sort((a, b) => b.rate - a.rate || b.stock - a.stock || a.price - b.price)[0] || null
}

async function getOperators(country, provider_id) {
  try {
    const res = await api('/v2/operators', { country, provider_id })
    return (Array.isArray(res?.data) ? res.data : [])
      .map(v => ({ id: Number(v.id), name: String(v.name || '').trim() }))
      .filter(v => v.id && v.name)
  } catch {
    return []
  }
}

function resetSession(conn, jid) {
  conn.nokosSession ||= {}
  delete conn.nokosSession[jid]
}

function buildCountryList(data, serviceId) {
  return data
    .filter(v => v && Array.isArray(v.pricelist) && v.pricelist.length > 0)
    .map(v => {
      const best = pickBestPricelist(v.pricelist)
      if (!best) return null
      return {
        number_id: Number(v.number_id),
        cname: String(v.name || ''),
        provider_id: String(best.provider_id),
        base_price: Number(best.price || 0),
        price: Number(best.price || 0) + PROFIT,
        rate: Number(best.rate || v.rate || 0),
        stock: Number(v.stock_total || 0),
        service_id: serviceId
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.rate - a.rate || a.base_price - b.base_price)
    .slice(0, 50)
}

// ==============================
// HANDLER UTAMA
// ==============================

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
  if (!APIKEY) return m.reply('❌ API RumahOTP belum diset.')

  const user = userData(m.sender)
  conn.nokosSession ||= {}
  global.db.data.deposits ||= {}

  const action = String(args[0] || '').toLowerCase()

  // ── TANPA ARGS → tampil menu ──────────────────────────────
  if (!action) {
    return m.reply(
`╭─── 🛒 *NOKOS* ───
│
│ *Layanan tersedia:*
│ ${usedPrefix + command} wa
│ ${usedPrefix + command} tele
│ ${usedPrefix + command} gmail
│ ${usedPrefix + command} ig
│ ${usedPrefix + command} shopee
│
│ *Saldo & Deposit:*
│ ${usedPrefix + command} deposit <nominal>
│ ${usedPrefix + command} cekdeposit
│ ${usedPrefix + command} ceksaldo
│
│ ${usedPrefix + command} batal — batalkan sesi
╰──────────────────`)
  }

  // ── CEK SALDO ─────────────────────────────────────────────
  if (action === 'ceksaldo') {
    return m.reply(
`╭─── 💰 *SALDO KAMU* ───
│ ${rupiah(user.saldo)}
╰────────────────────`)
  }

  // ── OWNER: TAMBAH SALDO ──────────────────────────────────
  if (action === 'addsaldo') {
    if (!isOwner) return m.reply('❌ Khusus owner.')
    const target = m.mentionedJid?.[0] || (args[1] ? args[1].replace(/\D/g, '') + '@s.whatsapp.net' : null)
    const amount = parseInt(args[2])
    if (!target || isNaN(amount)) return m.reply(`Format: ${usedPrefix + command} addsaldo @tag/628xxx nominal`)
    global.db.data.users[target] ||= {}
    if (typeof global.db.data.users[target].saldo !== 'number') global.db.data.users[target].saldo = 0
    global.db.data.users[target].saldo += amount
    return m.reply(`✅ Saldo *${target.split('@')[0]}* → ${rupiah(global.db.data.users[target].saldo)}`)
  }

  // ── OWNER: RESET SALDO ───────────────────────────────────
  if (action === 'resetsaldo') {
    if (!isOwner) return m.reply('❌ Khusus owner.')
    const target = m.mentionedJid?.[0] || (args[1] ? args[1].replace(/\D/g, '') + '@s.whatsapp.net' : null)
    if (!target) return m.reply(`Format: ${usedPrefix + command} resetsaldo @tag/628xxx`)
    if (!global.db.data.users[target]) return m.reply('❌ User tidak ditemukan.')
    global.db.data.users[target].saldo = 0
    return m.reply(`✅ Saldo *${target.split('@')[0]}* direset ke Rp0.`)
  }

  // ── DEPOSIT ───────────────────────────────────────────────
  if (action === 'deposit') {
    const nominal = parseInt(args[1])
    if (!nominal || isNaN(nominal)) return m.reply(`Format: ${usedPrefix + command} deposit <nominal>`)
    try {
      const res = await api('/v1/deposit/create', { amount: nominal, payment_id: 'qris' })
      if (!res.success || !res.data) return m.reply(`❌ Deposit gagal.\n${res?.error?.message || ''}`)
      const d = res.data
      const total = Number(d?.currency?.total || d.amount || nominal)
      const diterima = Number(d?.currency?.diterima || 0)
      const fee = Number(d?.currency?.fee || 0)
      const qrBuffer = Buffer.from((String(d.qr || '').split(',')[1] || ''), 'base64')

      const sent = await conn.sendMessage(m.chat, {
        image: qrBuffer,
        caption:
`╭─── 💳 *DEPOSIT QRIS* ───
│ ID       : ${d.id}
│ Bayar    : ${rupiah(total)}
│ Fee      : ${rupiah(fee)}
│ Masuk    : ${rupiah(diterima)}
│
│ Cek manual:
│ ${usedPrefix + command} cekdeposit ${d.id}
╰──────────────────────`
      }, { quoted: m })

      user.deposit = { id: String(d.id), total, diterima, msgKey: sent?.key || null, chat: m.chat }
      return
    } catch {
      return m.reply('❌ Terjadi kesalahan saat membuat deposit.')
    }
  }

  // ── CEK DEPOSIT ──────────────────────────────────────────
  if (action === 'cekdeposit') {
    const deposit_id = args[1] || user.deposit?.id
    if (!deposit_id) return m.reply(`Format: ${usedPrefix + command} cekdeposit <deposit_id>`)
    try {
      const res = await api('/v1/deposit/get_status', { deposit_id })
      if (!res.success || !res.data) return m.reply('❌ Gagal cek deposit.')
      const d = res.data
      const status = String(d.status || '').toLowerCase()

      if (status === 'success') {
        if (global.db.data.deposits[deposit_id]) return m.reply('⚠️ Deposit ini sudah diklaim.')
        global.db.data.deposits[deposit_id] = true
        const masuk = Number(user.deposit?.diterima || d.amount || 0)
        user.saldo += masuk
        try { if (user.deposit?.msgKey) await conn.sendMessage(user.deposit.chat || m.chat, { delete: user.deposit.msgKey }) } catch {}
        user.deposit = null
        return m.reply(
`╭─── ✅ *DEPOSIT BERHASIL* ───
│ Masuk  : ${rupiah(masuk)}
│ Saldo  : ${rupiah(user.saldo)}
╰──────────────────────`)
      }

      if (status === 'cancel') {
        try { if (user.deposit?.msgKey) await conn.sendMessage(user.deposit.chat || m.chat, { delete: user.deposit.msgKey }) } catch {}
        user.deposit = null
        return m.reply('❌ Deposit dibatalkan / expired.')
      }

      return m.reply(`ℹ️ Status deposit: *${status}*`)
    } catch {
      return m.reply('❌ Terjadi kesalahan saat cek deposit.')
    }
  }

  // ── BATAL SESI ────────────────────────────────────────────
  if (action === 'batal') {
    resetSession(conn, m.sender)
    return m.reply('✅ Sesi nokos dibatalkan.')
  }

  // ── LIST LAYANAN ──────────────────────────────────────────
  if (action === 'list') {
    try {
      const res = await api('/v2/services')
      if (!res.success || !Array.isArray(res.data)) return m.reply('❌ Gagal mengambil layanan.')
      let txt = '╭─── 📋 *LIST LAYANAN* ───\n│\n'
      res.data.slice(0, 50).forEach((v, i) => { txt += `│ ${i + 1}. ${v.service_name}\n` })
      txt += '╰──────────────────────'
      return m.reply(txt)
    } catch {
      return m.reply('❌ Terjadi kesalahan server.')
    }
  }

  // ── PILIH LAYANAN LANGSUNG (wa, ig, dll) ─────────────────
  if (action in services) {
    try {
      const serviceId = services[action]
      const res = await api('/v2/countries', { service_id: serviceId })
      if (!res.success || !Array.isArray(res.data)) return m.reply('❌ Gagal ambil negara.')

      const validCountries = buildCountryList(res.data, serviceId)
      if (!validCountries.length) return m.reply('❌ Negara tidak tersedia.')

      let txt = `╭─── 🌍 *${action.toUpperCase()}* — Pilih Negara ───\n│\n`
      const options = {}
      validCountries.forEach((v, i) => {
        txt += `│ ${i + 1}. ${v.cname} — ${rupiah(v.price)}\n`
        options[i + 1] = { ...v, service_name: action }
      })
      txt += '│\n│ Balas/reply pesan ini dengan angka\n╰──────────────────────'

      const msg = await m.reply(txt)
      conn.nokosSession[m.sender] = { stage: 'COUNTRY', id: msg.key.id, options, created: Date.now() }
      return
    } catch {
      return m.reply('❌ Terjadi kesalahan.')
    }
  }

  // ── DEFAULT ───────────────────────────────────────────────
  return m.reply(
`╭─── 🛒 *NOKOS* ───
│
│ *Layanan tersedia:*
│ ${usedPrefix + command} wa
│ ${usedPrefix + command} tele
│ ${usedPrefix + command} gmail
│ ${usedPrefix + command} ig
│ ${usedPrefix + command} shopee
│
│ *Saldo & Deposit:*
│ ${usedPrefix + command} deposit <nominal>
│ ${usedPrefix + command} cekdeposit
│ ${usedPrefix + command} ceksaldo
│
│ ${usedPrefix + command} batal — batalkan sesi
╰──────────────────`)
}

// ==============================
// HANDLER BEFORE (reply sesi)
// ==============================

handler.before = async (m, { conn }) => {
  conn.nokosSession ||= {}
  const session = conn.nokosSession[m.sender]
  if (!session) return
  if (!m.text || isNaN(m.text.trim())) return
  if (!m.quoted || m.quoted.id !== session.id) return

  // Sesi expired (5 menit)
  if (Date.now() - Number(session.created || 0) > 300000) {
    resetSession(conn, m.sender)
    return m.reply('⏰ Sesi kadaluarsa. Silakan ulangi dari awal.')
  }

  const choice = parseInt(m.text.trim())
  const selected = session.options[choice]
  if (!selected) return m.reply('❌ Pilihan tidak valid.')

  try {
    // ── STAGE: PILIH NEGARA ───────────────────────────────
    if (session.stage === 'COUNTRY') {
      const operators = await getOperators(selected.cname, selected.provider_id)
      if (!operators.length) {
        resetSession(conn, m.sender)
        return m.reply('❌ Operator kosong. Silakan ulangi dari awal.')
      }

      let txt = `╭─── 📡 *${selected.cname}* — Pilih Operator ───\n│\n`
      const options = {}
      operators.forEach((v, i) => {
        txt += `│ ${i + 1}. ${v.name}\n`
        options[i + 1] = { ...selected, operator_id: Number(v.id), operator_name: v.name }
      })
      txt += '│\n│ Balas/reply pesan ini dengan angka\n╰──────────────────────'

      const msg = await m.reply(txt)
      conn.nokosSession[m.sender] = { stage: 'OPERATOR', id: msg.key.id, options, created: Date.now() }
      return
    }

    // ── STAGE: KONFIRMASI ORDER ───────────────────────────
    if (session.stage === 'OPERATOR') {
      const user = userData(m.sender)

      if (user.saldo < selected.price) {
        resetSession(conn, m.sender)
        return m.reply(
`❌ *Saldo tidak cukup*

Harga   : ${rupiah(selected.price)}
Saldo   : ${rupiah(user.saldo)}
Kurang  : ${rupiah(selected.price - user.saldo)}`)
      }

      const res = await api('/v2/orders', {
        number_id: Number(selected.number_id),
        provider_id: Number(selected.provider_id),
        operator_id: Number(selected.operator_id)
      })

      if (!res.success || !res.data) {
        resetSession(conn, m.sender)
        return m.reply(`❌ Gagal membuat order.\n${res?.error?.message || ''}`)
      }

      const d = res.data
      user.saldo -= selected.price
      user.nokos = {
        id: String(d.order_id),
        price: Number(selected.price),
        time: Date.now(),
        chat: m.chat,
        phone: String(d.phone_number || ''),
        service: String(d.service || selected.service_name || ''),
        country: String(d.country || selected.cname || '')
      }

      resetSession(conn, m.sender)

      return m.reply(
`╭─── ✅ *ORDER BERHASIL* ───
│
│ ID       : ${d.order_id}
│ Nomor    : ${d.phone_number}
│ Layanan  : ${d.service}
│ Negara   : ${d.country}
│ Operator : ${selected.operator_name}
│ Harga    : ${rupiah(selected.price)}
│ Saldo    : ${rupiah(user.saldo)}
│
│ ⏳ Menunggu OTP... (maks 3 menit)
╰──────────────────────`)
    }

  } catch {
    resetSession(conn, m.sender)
    return m.reply('❌ Terjadi kesalahan. Silakan ulangi.')
  }
}

handler.help = ['nokos']
handler.tags = ['store']
handler.command = /^(nokos)$/i

module.exports = handler

// ==============================
// AUTO POLLING OTP
// ==============================

if (!global.nokosAuto) {
  global.nokosAuto = true

  setInterval(async () => {
    if (!global.conn || !global.db?.data?.users || !APIKEY) return

    for (const jid in global.db.data.users) {
      const user = global.db.data.users[jid]
      if (!user?.nokos?.id) continue

      try {
        const res = await axios.get('https://www.rumahotp.com/api/v1/orders/get_status', {
          headers: { 'x-apikey': APIKEY, Accept: 'application/json' },
          params: { order_id: user.nokos.id },
          timeout: 30000
        })

        const d = res.data?.data
        if (!d) continue

        const status = String(d.status || '').toLowerCase()

        // OTP masuk
        if (d.otp_code && d.otp_code !== '-') {
          await global.conn.sendMessage(user.nokos.chat, {
            text:
`╭─── 🔑 *OTP MASUK!* ───
│
│ ID      : ${d.order_id}
│ Nomor   : ${d.phone_number}
│ OTP     : *${d.otp_code}*
│
│ Segera gunakan sebelum expired!
╰──────────────────────`
          })
          user.nokos = null
          continue
        }

        // Order dibatalkan/expired dari sisi provider
        if (status === 'canceled' || status === 'expiring') {
          user.saldo += Number(user.nokos.price || 0)
          await global.conn.sendMessage(user.nokos.chat, {
            text:
`╭─── ⚠️ *ORDER BERAKHIR* ───
│
│ ID     : ${d.order_id}
│ Status : ${status}
│ Saldo  : ${rupiah(user.nokos.price)} dikembalikan
╰──────────────────────`
          })
          user.nokos = null
          continue
        }

        // Timeout 3 menit dari sisi bot
        if (Date.now() - Number(user.nokos.time || 0) > OTP_TIMEOUT) {
          try {
            await axios.get('https://www.rumahotp.com/api/v1/orders/set_status', {
              headers: { 'x-apikey': APIKEY, Accept: 'application/json' },
              params: { order_id: user.nokos.id, status: 'cancel' },
              timeout: 30000
            })
          } catch {}

          user.saldo += Number(user.nokos.price || 0)
          await global.conn.sendMessage(user.nokos.chat, {
            text:
`╭─── ⏰ *WAKTU HABIS* ───
│
│ ID     : ${user.nokos.id}
│ Saldo  : ${rupiah(user.nokos.price)} dikembalikan
╰──────────────────────`
          })
          user.nokos = null
        }

      } catch {}
    }
  }, CHECK_INTERVAL)
}