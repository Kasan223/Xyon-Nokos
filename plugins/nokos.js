//kasanvx

const axios = require('axios')

const PROFIT = 500
const OTP_TIMEOUT = 180000
const CHECK_INTERVAL = 10000

function getKey() { return global.rumahotp || '' }

function rupiah(x) { return 'Rp' + Number(x || 0).toLocaleString('id-ID') }

function userData(id) {
  global.db.data.users[id] = global.db.data.users[id] || {}
  const u = global.db.data.users[id]
  if (typeof u.saldo !== 'number') u.saldo = 0
  if (!u.deposit) u.deposit = null
  if (!u.nokos) u.nokos = null
  return u
}

async function api(path, params) {
  const res = await axios.get('https://www.rumahotp.com/api' + path, {
    headers: { 'x-apikey': getKey(), Accept: 'application/json' },
    params: params || {},
    timeout: 30000
  })
  return res.data
}

function pickBest(pricelist) {
  return (pricelist || [])
    .filter(function(v) { return v && v.provider_id && Number(v.price) > 0 && v.available !== false })
    .map(function(v) { return { provider_id: String(v.provider_id), price: Number(v.price), rate: Number(v.rate || 0), stock: Number(v.stock || 0) } })
    .sort(function(a, b) { return b.rate - a.rate || b.stock - a.stock || a.price - b.price })[0] || null
}

function buildCountryList(data, serviceId) {
  return (data || [])
    .filter(function(v) { return v && Array.isArray(v.pricelist) && v.pricelist.length })
    .map(function(v) {
      const best = pickBest(v.pricelist)
      if (!best) return null
      return {
        number_id: Number(v.number_id), cname: String(v.name || ''),
        provider_id: String(best.provider_id), base_price: Number(best.price),
        price: Number(best.price) + PROFIT, rate: Number(best.rate || v.rate || 0),
        stock: Number(v.stock_total || 0), service_id: serviceId
      }
    })
    .filter(Boolean)
    .sort(function(a, b) { return b.rate - a.rate || a.base_price - b.base_price })
    .slice(0, 30)
}

async function getOperators(country, provider_id) {
  try {
    const res = await api('/v2/operators', { country: country, provider_id: provider_id })
    return (Array.isArray(res && res.data) ? res.data : [])
      .map(function(v) { return { id: Number(v.id), name: String(v.name || '').trim() } })
      .filter(function(v) { return v.id && v.name })
  } catch (e) { return [] }
}

function resetSesi(conn, jid) {
  conn.nokosSession = conn.nokosSession || {}
  delete conn.nokosSession[jid]
}

const services = {
  wa: 13, whatsapp: 13, tele: 4, telegram: 4,
  gmail: 6, google: 6, ig: 16, instagram: 16, shopee: 36
}

// ══════════════════════════════════════════
// HANDLER UTAMA
// ══════════════════════════════════════════

const handler = async function(m, opts) {
  const conn = opts.conn, args = opts.args, usedPrefix = opts.usedPrefix
  const command = opts.command, isOwner = opts.isOwner

  if (!getKey()) return m.reply('❌ API RumahOTP belum diset di config.')

  const user = userData(m.sender)
  conn.nokosSession = conn.nokosSession || {}
  global.db.data.deposits = global.db.data.deposits || {}
  global.db.data.depositClaims = global.db.data.depositClaims || {}

  const action = String(args[0] || '').toLowerCase()
  const p = usedPrefix + command

  // ── MENU ─────────────────────────────────────────────────
  if (!action) {
    return m.reply(
      '╭─── 🛒 *NOKOS* ───\n│\n' +
      '│ *Beli Nomor OTP:*\n' +
      '│ ' + p + ' wa / tele / gmail\n' +
      '│ ' + p + ' ig / shopee\n│\n' +
      '│ *Saldo & Deposit:*\n' +
      '│ ' + p + ' ceksaldo\n' +
      '│ ' + p + ' saldorumah  ← cek saldo RumahOTP\n' +
      '│ ' + p + ' deposit <nominal>\n' +
      '│ ' + p + ' cekdeposit [id]\n' +
      '│ ' + p + ' bataldeposit [id]\n│\n' +
      '│ *Lainnya:*\n' +
      '│ ' + p + ' batal  ← batalkan sesi\n' +
      '╰──────────────────'
    )
  }

  // ── CEK SALDO BOT ────────────────────────────────────────
  if (action === 'ceksaldo') {
    return m.reply('╭─── 💰 *SALDO* ───\n│ ' + rupiah(user.saldo) + '\n╰──────────────────')
  }

  // ── CEK SALDO RUMAHOTP ───────────────────────────────────
  if (action === 'saldorumah') {
    try {
      const res = await api('/v1/user/balance')
      if (!res.success || !res.data) return m.reply('❌ Gagal ambil saldo RumahOTP.')
      const d = res.data
      return m.reply(
        '╭─── 🏠 *SALDO RUMAHOTP* ───\n' +
        '│ Saldo    : ' + rupiah(d.balance) + '\n' +
        '│ Username : ' + (d.username || '-') + '\n' +
        '│ Nama     : ' + (d.first_name || '') + ' ' + (d.last_name || '') + '\n' +
        '╰──────────────────────'
      )
    } catch (e) {
      return m.reply('❌ Gagal ambil saldo RumahOTP.')
    }
  }

  // ── ADDSALDO (owner) ─────────────────────────────────────
  if (action === 'addsaldo') {
    if (!isOwner) return m.reply('❌ Khusus owner.')
    const target = (m.mentionedJid && m.mentionedJid[0]) || (args[1] ? args[1].replace(/\D/g, '') + '@s.whatsapp.net' : null)
    const amount = parseInt(args[2])
    if (!target || isNaN(amount)) return m.reply('Format: ' + p + ' addsaldo @user nominal')
    global.db.data.users[target] = global.db.data.users[target] || {}
    if (typeof global.db.data.users[target].saldo !== 'number') global.db.data.users[target].saldo = 0
    global.db.data.users[target].saldo += amount
    return m.reply('✅ Saldo ' + target.split('@')[0] + ' → ' + rupiah(global.db.data.users[target].saldo))
  }

  // ── RESETSALDO (owner) ───────────────────────────────────
  if (action === 'resetsaldo') {
    if (!isOwner) return m.reply('❌ Khusus owner.')
    const target = (m.mentionedJid && m.mentionedJid[0]) || (args[1] ? args[1].replace(/\D/g, '') + '@s.whatsapp.net' : null)
    if (!target) return m.reply('Format: ' + p + ' resetsaldo @user')
    if (!global.db.data.users[target]) return m.reply('❌ User tidak ditemukan.')
    global.db.data.users[target].saldo = 0
    return m.reply('✅ Saldo ' + target.split('@')[0] + ' direset ke Rp0.')
  }

  // ── DEPOSIT ───────────────────────────────────────────────
  if (action === 'deposit') {
    const nominal = parseInt(args[1])
    if (!nominal || isNaN(nominal)) return m.reply('Format: ' + p + ' deposit <nominal>\nContoh: ' + p + ' deposit 10000')
    try {
      const res = await api('/v1/deposit/create', { amount: nominal, payment_id: 'qris' })
      if (!res.success || !res.data) return m.reply('❌ Deposit gagal.\n' + ((res && res.error && res.error.message) || ''))
      const d = res.data
      const total = Number((d.currency && d.currency.total) || d.amount || nominal)
      const diterima = Number((d.currency && d.currency.diterima) || 0)
      const fee = Number((d.currency && d.currency.fee) || 0)
      const expired = Number(d.expired || 0)
      const qrBuffer = Buffer.from((String(d.qr || '').split(',')[1] || ''), 'base64')

      const sent = await conn.sendMessage(m.chat, {
        image: qrBuffer,
        caption:
          '╭─── 💳 *DEPOSIT QRIS* ───\n' +
          '│ ID      : ' + d.id + '\n' +
          '│ Bayar   : ' + rupiah(total) + '\n' +
          '│ Fee     : ' + rupiah(fee) + '\n' +
          '│ Masuk   : ' + rupiah(diterima) + '\n' +
          (expired ? '│ Expired : ' + new Date(expired).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB\n' : '') +
          '│\n│ Saldo masuk otomatis setelah bayar.\n' +
          '│ Cek manual: *' + p + ' cekdeposit*\n' +
          '│ Batal: *' + p + ' bataldeposit*\n' +
          '╰──────────────────────'
      }, { quoted: m })

      user.deposit = { id: String(d.id), total: total, diterima: diterima, fee: fee, expired: expired, msgKey: (sent && sent.key) || null, chat: m.chat, status: 'pending' }
      return
    } catch (e) {
      return m.reply('❌ Gagal membuat deposit.')
    }
  }

  // ── CEK DEPOSIT ──────────────────────────────────────────
  if (action === 'cekdeposit') {
    const deposit_id = args[1] || (user.deposit && user.deposit.id)
    if (!deposit_id) return m.reply('Tidak ada deposit pending.\nFormat: ' + p + ' cekdeposit <id>')
    try {
      const res = await api('/v1/deposit/get_status', { deposit_id: deposit_id })
      if (!res.success || !res.data) return m.reply('❌ Gagal cek deposit.')
      const d = res.data
      const status = String(d.status || '').toLowerCase()

      if (status === 'success') {
        if (global.db.data.depositClaims[deposit_id]) return m.reply('⚠️ Deposit ini sudah diklaim.')
        global.db.data.depositClaims[deposit_id] = true
        const masuk = Number((user.deposit && user.deposit.diterima) || d.amount || 0)
        user.saldo += masuk
        try { if (user.deposit && user.deposit.msgKey) await conn.sendMessage(user.deposit.chat || m.chat, { delete: user.deposit.msgKey }) } catch (e) {}
        user.deposit = null
        return m.reply('╭─── ✅ *DEPOSIT BERHASIL* ───\n│ Masuk  : ' + rupiah(masuk) + '\n│ Saldo  : ' + rupiah(user.saldo) + '\n╰──────────────────────')
      }
      if (status === 'cancel') {
        try { if (user.deposit && user.deposit.msgKey) await conn.sendMessage(user.deposit.chat || m.chat, { delete: user.deposit.msgKey }) } catch (e) {}
        user.deposit = null
        return m.reply('❌ Deposit dibatalkan / expired.')
      }
      return m.reply('ℹ️ Status deposit: *' + status + '*')
    } catch (e) {
      return m.reply('❌ Gagal cek deposit.')
    }
  }

  // ── BATAL DEPOSIT ─────────────────────────────────────────
  if (action === 'bataldeposit') {
    const deposit_id = args[1] || (user.deposit && user.deposit.id)
    if (!deposit_id) return m.reply('Tidak ada deposit yang bisa dibatalkan.')
    try {
      const res = await api('/v1/deposit/cancel', { deposit_id: deposit_id })
      if (!res.success) return m.reply('❌ Gagal batalkan deposit.\n' + ((res && res.error && res.error.message) || ''))
      try { if (user.deposit && user.deposit.msgKey) await conn.sendMessage(user.deposit.chat || m.chat, { delete: user.deposit.msgKey }) } catch (e) {}
      user.deposit = null
      return m.reply('✅ Deposit *' + deposit_id + '* berhasil dibatalkan.')
    } catch (e) {
      return m.reply('❌ Gagal batalkan deposit.')
    }
  }

  // ── BATAL SESI ───────────────────────────────────────────
  if (action === 'batal') {
    resetSesi(conn, m.sender)
    return m.reply('✅ Sesi nokos dibatalkan.')
  }

  // ── PILIH LAYANAN ────────────────────────────────────────
  if (services[action] !== undefined) {
    try {
      const serviceId = services[action]
      const res = await api('/v2/countries', { service_id: serviceId })
      if (!res.success || !Array.isArray(res.data)) return m.reply('❌ Gagal ambil data negara.')

      const list = buildCountryList(res.data, serviceId)
      if (!list.length) return m.reply('❌ Tidak ada negara tersedia.')

      const options = {}
      let txt = '╭─── 🌍 *' + action.toUpperCase() + '* — Pilih Negara ───\n│\n'
      list.forEach(function(v, i) {
        options[i + 1] = Object.assign({}, v, { service_name: action })
        txt += '│ ' + (i + 1) + '. ' + v.cname + ' — ' + rupiah(v.price) + ' (stok: ' + v.stock + ')\n'
      })
      txt += '│\n│ *Reply* pesan ini dengan nomor pilihan\n╰──────────────────────'

      const msg = await m.reply(txt)
      conn.nokosSession[m.sender] = { stage: 'COUNTRY', id: msg.key.id, options: options, created: Date.now() }
      return
    } catch (e) {
      return m.reply('❌ Terjadi kesalahan.')
    }
  }

  return m.reply('Ketik *' + p + '* untuk lihat menu.')
}

// ══════════════════════════════════════════
// BEFORE HANDLER
// ══════════════════════════════════════════

handler.before = async function(m, opts) {
  const conn = opts.conn
  conn.nokosSession = conn.nokosSession || {}
  global.db.data.depositClaims = global.db.data.depositClaims || {}

  // cekdeposit tanpa prefix
  if (m.text && /^cekdeposit$/i.test(String(m.text).trim())) {
    if (!getKey()) return
    const user = userData(m.sender)
    if (!user.deposit) return m.reply('ℹ️ Tidak ada deposit pending.')
    try {
      const res = await api('/v1/deposit/get_status', { deposit_id: user.deposit.id })
      if (!res.success || !res.data) return m.reply('❌ Gagal cek deposit.')
      const d = res.data
      const status = String(d.status || '').toLowerCase()
      if (status === 'success') {
        if (global.db.data.depositClaims[user.deposit.id]) { user.deposit = null; return m.reply('⚠️ Sudah diklaim.') }
        global.db.data.depositClaims[user.deposit.id] = true
        const masuk = Number((user.deposit && user.deposit.diterima) || 0)
        const id = user.deposit.id
        user.saldo += masuk
        try { if (user.deposit.msgKey) await conn.sendMessage(user.deposit.chat || m.chat, { delete: user.deposit.msgKey }) } catch (e) {}
        user.deposit = null
        return m.reply('╭─── ✅ *DEPOSIT BERHASIL* ───\n│ ID     : ' + id + '\n│ Masuk  : ' + rupiah(masuk) + '\n│ Saldo  : ' + rupiah(user.saldo) + '\n╰──────────────────────')
      }
      if (status === 'cancel') {
        try { if (user.deposit.msgKey) await conn.sendMessage(user.deposit.chat || m.chat, { delete: user.deposit.msgKey }) } catch (e) {}
        user.deposit = null
        return m.reply('❌ Deposit dibatalkan / expired.')
      }
      return m.reply('ℹ️ Status: *' + status + '*')
    } catch (e) { return m.reply('❌ Gagal cek deposit.') }
  }

  // sesi reply
  const session = conn.nokosSession[m.sender]
  if (!session) return
  if (!m.text || isNaN(m.text.trim())) return
  if (!m.quoted || m.quoted.id !== session.id) return

  if (Date.now() - Number(session.created || 0) > 300000) {
    resetSesi(conn, m.sender)
    return m.reply('⏰ Sesi kadaluarsa. Ulangi dari awal.')
  }

  const choice = parseInt(m.text.trim())
  const selected = session.options[choice]
  if (!selected) return m.reply('❌ Pilihan tidak valid.')

  try {
    if (session.stage === 'COUNTRY') {
      const operators = await getOperators(selected.cname, selected.provider_id)
      if (!operators.length) {
        resetSesi(conn, m.sender)
        return m.reply('❌ Operator tidak tersedia. Coba negara lain.')
      }
      const options = {}
      let txt = '╭─── 📡 *' + selected.cname + '* — Pilih Operator ───\n│\n'
      operators.forEach(function(v, i) {
        options[i + 1] = Object.assign({}, selected, { operator_id: Number(v.id), operator_name: v.name })
        txt += '│ ' + (i + 1) + '. ' + v.name + '\n'
      })
      txt += '│\n│ *Reply* pesan ini dengan nomor pilihan\n╰──────────────────────'
      const msg = await m.reply(txt)
      conn.nokosSession[m.sender] = { stage: 'OPERATOR', id: msg.key.id, options: options, created: Date.now() }
      return
    }

    if (session.stage === 'OPERATOR') {
      const user = userData(m.sender)
      if (user.saldo < selected.price) {
        resetSesi(conn, m.sender)
        return m.reply('❌ *Saldo tidak cukup*\n\nHarga  : ' + rupiah(selected.price) + '\nSaldo  : ' + rupiah(user.saldo) + '\nKurang : ' + rupiah(selected.price - user.saldo))
      }

      const res = await api('/v2/orders', {
        number_id: Number(selected.number_id),
        provider_id: Number(selected.provider_id),
        operator_id: Number(selected.operator_id)
      })

      if (!res.success || !res.data) {
        resetSesi(conn, m.sender)
        return m.reply('❌ Gagal buat order.\n' + ((res && res.error && res.error.message) || ''))
      }

      const d = res.data
      user.saldo -= selected.price
      user.nokos = {
        id: String(d.order_id), price: Number(selected.price), time: Date.now(),
        chat: m.chat, phone: String(d.phone_number || ''),
        service: String(d.service || selected.service_name || ''),
        country: String(d.country || selected.cname || '')
      }
      resetSesi(conn, m.sender)

      return m.reply(
        '╭─── ✅ *ORDER BERHASIL* ───\n│\n' +
        '│ ID       : ' + d.order_id + '\n' +
        '│ Nomor    : ' + d.phone_number + '\n' +
        '│ Layanan  : ' + d.service + '\n' +
        '│ Negara   : ' + d.country + '\n' +
        '│ Operator : ' + selected.operator_name + '\n' +
        '│ Harga    : ' + rupiah(selected.price) + '\n' +
        '│ Saldo    : ' + rupiah(user.saldo) + '\n│\n' +
        '│ ⏳ Menunggu OTP... (maks 3 menit)\n' +
        '╰──────────────────────'
      )
    }
  } catch (e) {
    resetSesi(conn, m.sender)
    return m.reply('❌ Terjadi kesalahan. Silakan ulangi.')
  }
}

handler.help = ['nokos']
handler.tags = ['store']
handler.command = /^(nokos)$/i
module.exports = handler

// ══════════════════════════════════════════
// AUTO POLLING OTP + DEPOSIT WATCHER
// ══════════════════════════════════════════

if (!global.nokosAuto) {
  global.nokosAuto = true

  // Polling OTP
  setInterval(async function() {
    if (!global.conn || !global.db || !global.db.data || !global.db.data.users || !getKey()) return
    for (const jid in global.db.data.users) {
      const user = global.db.data.users[jid]
      if (!user || !user.nokos || !user.nokos.id) continue
      try {
        const res = await axios.get('https://www.rumahotp.com/api/v1/orders/get_status', {
          headers: { 'x-apikey': getKey(), Accept: 'application/json' },
          params: { order_id: user.nokos.id }, timeout: 30000
        })
        const d = res.data && res.data.data
        if (!d) continue
        const status = String(d.status || '').toLowerCase()

        if (d.otp_code && d.otp_code !== '-') {
          await global.conn.sendMessage(user.nokos.chat, {
            text: '╭─── 🔑 *OTP MASUK!* ───\n│\n│ ID     : ' + d.order_id + '\n│ Nomor  : ' + d.phone_number + '\n│ OTP    : *' + d.otp_code + '*\n│\n│ Segera gunakan!\n╰──────────────────────'
          })
          user.nokos = null
          continue
        }

        if (status === 'canceled' || status === 'expiring') {
          user.saldo += Number(user.nokos.price || 0)
          await global.conn.sendMessage(user.nokos.chat, {
            text: '⚠️ Order ' + d.order_id + ' berakhir.\nSaldo ' + rupiah(user.nokos.price) + ' dikembalikan.'
          })
          user.nokos = null
          continue
        }

        if (Date.now() - Number(user.nokos.time || 0) > OTP_TIMEOUT) {
          try {
            await axios.get('https://www.rumahotp.com/api/v1/orders/set_status', {
              headers: { 'x-apikey': getKey(), Accept: 'application/json' },
              params: { order_id: user.nokos.id, status: 'cancel' }, timeout: 30000
            })
          } catch (e) {}
          user.saldo += Number(user.nokos.price || 0)
          await global.conn.sendMessage(user.nokos.chat, {
            text: '⏰ Waktu habis. Order ' + user.nokos.id + ' dibatalkan.\nSaldo ' + rupiah(user.nokos.price) + ' dikembalikan.'
          })
          user.nokos = null
        }
      } catch (e) {}
    }
  }, CHECK_INTERVAL)

  // Auto deposit watcher
  setInterval(async function() {
    if (!global.conn || !global.db || !global.db.data || !global.db.data.users || !getKey()) return
    global.db.data.depositClaims = global.db.data.depositClaims || {}
    for (const jid in global.db.data.users) {
      const u = global.db.data.users[jid]
      if (!u || !u.deposit || u.deposit.status !== 'pending') continue
      try {
        const st = await axios.get('https://www.rumahotp.com/api/v1/deposit/get_status', {
          headers: { 'x-apikey': getKey(), Accept: 'application/json' },
          params: { deposit_id: u.deposit.id }, timeout: 30000
        })
        const data = st.data && st.data.data
        if (!data) continue
        const status = String(data.status || '').toLowerCase()

        if (status === 'success') {
          if (global.db.data.depositClaims[u.deposit.id]) { u.deposit = null; continue }
          global.db.data.depositClaims[u.deposit.id] = true
          u.saldo += Number(u.deposit.diterima || 0)
          try { if (u.deposit.msgKey) await global.conn.sendMessage(u.deposit.chat, { delete: u.deposit.msgKey }) } catch (e) {}
          await global.conn.sendMessage(u.deposit.chat, {
            text: '╭─── ✅ *DEPOSIT BERHASIL* ───\n│ ID     : ' + u.deposit.id + '\n│ Masuk  : ' + rupiah(u.deposit.diterima) + '\n│ Saldo  : ' + rupiah(u.saldo) + '\n╰──────────────────────'
          })
          u.deposit = null
          continue
        }

        if (status === 'cancel') {
          try { if (u.deposit.msgKey) await global.conn.sendMessage(u.deposit.chat, { delete: u.deposit.msgKey }) } catch (e) {}
          await global.conn.sendMessage(u.deposit.chat, { text: '❌ Deposit ' + u.deposit.id + ' expired / dibatalkan.' })
          u.deposit = null
          continue
        }

        // Fallback expired
        if (u.deposit.expired && Date.now() > Number(u.deposit.expired) + 30000) {
          try { if (u.deposit.msgKey) await global.conn.sendMessage(u.deposit.chat, { delete: u.deposit.msgKey }) } catch (e) {}
          await global.conn.sendMessage(u.deposit.chat, { text: '⏰ Deposit ' + u.deposit.id + ' expired.' })
          u.deposit = null
        }
      } catch (e) {}
    }
  }, CHECK_INTERVAL)
        }
