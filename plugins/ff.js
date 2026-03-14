//kasanvx

const axios = require('axios')

function getKey() { return global.rumahotp || '' }
function rupiah(x) { return 'Rp' + Number(x || 0).toLocaleString('id-ID') }
function now() { return new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) }

function userData(id) {
  global.db.data.users[id] = global.db.data.users[id] || {}
  const u = global.db.data.users[id]
  if (typeof u.saldo !== 'number') u.saldo = 0
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

// Cache produk FF
let ffCache = null
let ffCacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

async function getFFProducts() {
  if (ffCache && Date.now() - ffCacheTime < CACHE_TTL) return ffCache
  const res = await api('/v1/h2h/product')
  if (!res.success || !Array.isArray(res.data)) throw new Error('Gagal ambil produk')
  const list = res.data.filter(function(v) {
    const kode = String(v.code || '').toUpperCase()
    const brand = String(v.brand || '').toLowerCase()
    return brand === 'freefire' || kode.startsWith('FF') || kode.startsWith('KFFBP')
  })
  ffCache = list
  ffCacheTime = Date.now()
  return list
}

// Kelompokkan produk FF ke kategori yang mudah dipahami
function groupProducts(list) {
  const diamond = []
  const weekly = []
  const monthly = []
  const pass = []
  const other = []

  list.forEach(function(v) {
    const kode = String(v.code || '').toUpperCase()
    const nama = String(v.name || '').toLowerCase()
    if (kode.startsWith('FFM1') || nama.includes('mingguan')) weekly.push(v)
    else if (kode.startsWith('FFM2') || nama.includes('bulanan')) monthly.push(v)
    else if (kode.startsWith('FFLUP') || kode === 'KFFBP' || nama.includes('pass') || nama.includes('booyah')) pass.push(v)
    else if (nama.includes('diamond')) diamond.push(v)
    else other.push(v)
  })

  // Sort diamond by jumlah (asc)
  diamond.sort(function(a, b) { return a.price - b.price })

  return { diamond: diamond, weekly: weekly, monthly: monthly, pass: pass, other: other }
}

function formatMenu(list) {
  const g = groupProducts(list)
  let txt = '╭─── 💎 *TOPUP FREE FIRE* ───\n│\n'

  function addSection(label, items) {
    if (!items.length) return
    txt += '│ *' + label + '*\n'
    items.forEach(function(v, i) {
      const disc = v.price_info && v.price_info.price_discount_percent > 0
        ? ' (-' + v.price_info.price_discount_percent + '%)' : ''
      txt += '│ ' + (i + 1) + '. ' + v.name + '\n'
      txt += '│    ' + rupiah(v.price) + disc + '\n'
    })
    txt += '│\n'
  }

  addSection('💎 Diamond', g.diamond.slice(0, 10)) // tampil 10 termurah dulu
  addSection('📅 Mingguan', g.weekly)
  addSection('🗓️ Bulanan', g.monthly)
  addSection('🎫 Pass & Lainnya', g.pass)

  if (g.diamond.length > 10) {
    txt += '│ _...dan ' + (g.diamond.length - 10) + ' paket diamond lainnya_\n'
    txt += '│ Ketik *.ff semua* untuk lihat semua\n│\n'
  }

  txt += '│ ──────────────────\n'
  txt += '│ *Cara topup:*\n'
  txt += '│ Ketik nomor urut produk\n'
  txt += '│ lalu ID Free Fire kamu\n│\n'
  txt += '│ Contoh:\n'
  txt += '│ *.ff 1 123456789*\n'
  txt += '│ *.ff 1 123456789 1234* (pakai server)\n'
  txt += '╰──────────────────────'
  return txt
}

function formatMenuSemua(list) {
  const g = groupProducts(list)
  let txt = '╭─── 💎 *DIAMOND FREE FIRE* ───\n│\n'
  g.diamond.forEach(function(v, i) {
    const disc = v.price_info && v.price_info.price_discount_percent > 0
      ? ' (-' + v.price_info.price_discount_percent + '%)' : ''
    txt += '│ ' + (i + 1) + '. ' + v.name + ' — ' + rupiah(v.price) + disc + '\n'
  })
  txt += '│\n│ Ketik *.ff <nomor> <ID FF>*\n╰──────────────────────'
  return txt
}

function resetSesi(conn, jid) {
  conn.ffSession = conn.ffSession || {}
  delete conn.ffSession[jid]
}

// ══════════════════════════════════════════
// HANDLER UTAMA
// ══════════════════════════════════════════

const handler = async function(m, opts) {
  const conn = opts.conn, args = opts.args
  const usedPrefix = opts.usedPrefix, command = opts.command
  conn.ffSession = conn.ffSession || {}

  if (!getKey()) return m.reply('❌ API RumahOTP belum diset.')

  const input = String(args[0] || '').toLowerCase()

  // ── MENU UTAMA ────────────────────────────────────────────
  if (!input || input === 'list' || input === 'menu') {
    try {
      const list = await getFFProducts()
      if (!list.length) return m.reply('❌ Produk Free Fire tidak tersedia saat ini.')
      return m.reply(formatMenu(list))
    } catch (e) {
      return m.reply('❌ Gagal ambil daftar produk. Coba lagi.')
    }
  }

  // ── SEMUA DIAMOND ─────────────────────────────────────────
  if (input === 'semua' || input === 'all') {
    try {
      const list = await getFFProducts()
      return m.reply(formatMenuSemua(list))
    } catch (e) {
      return m.reply('❌ Gagal ambil daftar produk.')
    }
  }

  // ── CEK STATUS TRANSAKSI ─────────────────────────────────
  if (input === 'status') {
    const txId = args[1]
    if (!txId) return m.reply('Format: ' + usedPrefix + command + ' status <id_transaksi>')
    try {
      const res = await api('/v1/h2h/transaction/status', { transaction_id: txId })
      if (!res.success || !res.data) return m.reply('❌ Transaksi tidak ditemukan.')
      const d = res.data
      const statusEmoji = d.status === 'success' ? '✅' : d.status === 'failed' ? '❌' : '⏳'
      return m.reply(
        '╭─── 📋 *CEK TRANSAKSI* ───\n' +
        '│ ID      : ' + (d.transaction_id || txId) + '\n' +
        '│ Produk  : ' + (d.product_name || '-') + '\n' +
        '│ ID FF   : ' + (d.target || '-') + '\n' +
        '│ Status  : ' + statusEmoji + ' ' + (d.status || '-') + '\n' +
        (d.sn ? '│ SN      : ' + d.sn + '\n' : '') +
        '╰──────────────────────'
      )
    } catch (e) {
      return m.reply('❌ Gagal cek transaksi.')
    }
  }

  // ── TOPUP: .ff <nomor/kode> <ID FF> [server] ─────────────
  // Support nomor urut (1, 2, 3...) atau kode langsung (FF50, FF100...)
  const isNomor = !isNaN(input) && parseInt(input) > 0
  const userId = args[1]
  const server = args[2] || ''

  if (!userId) {
    return m.reply(
      '⚠️ ID Free Fire tidak boleh kosong!\n\n' +
      'Format: *.ff <nomor> <ID FF>*\n' +
      'Contoh: *.ff 1 123456789*\n\n' +
      'Lihat daftar: *.ff*'
    )
  }

  try {
    const list = await getFFProducts()
    const g = groupProducts(list)

    let produk = null

    if (isNomor) {
      // Cari berdasarkan nomor urut diamond
      const idx = parseInt(input) - 1
      produk = g.diamond[idx] || null
    } else {
      // Cari berdasarkan kode
      const kode = input.toUpperCase()
      produk = list.find(function(v) { return String(v.code || '').toUpperCase() === kode }) || null
    }

    if (!produk) {
      return m.reply(
        '❌ Produk tidak ditemukan.\n\n' +
        'Ketik *.ff* untuk lihat daftar produk.'
      )
    }

    const user = userData(m.sender)

    if (user.saldo < produk.price) {
      return m.reply(
        '❌ *Saldo kamu tidak cukup*\n\n' +
        'Produk : *' + produk.name + '*\n' +
        'Harga  : ' + rupiah(produk.price) + '\n' +
        'Saldo  : ' + rupiah(user.saldo) + '\n' +
        'Kurang : *' + rupiah(produk.price - user.saldo) + '*\n\n' +
        '💳 Top up dulu: *.nokos deposit <nominal>*'
      )
    }

    const target = server ? userId + '|' + server : userId

    const txt =
      '╭─── 🔥 *KONFIRMASI TOPUP FF* ───\n│\n' +
      '│ Produk : *' + produk.name + '*\n' +
      '│ ID FF  : *' + userId + '*\n' +
      (server ? '│ Server : *' + server + '*\n' : '') +
      '│ Harga  : ' + rupiah(produk.price) + '\n' +
      '│ Saldo  : ' + rupiah(user.saldo) + '\n│\n' +
      '│ ⚠️ Pastikan ID FF sudah *benar*!\n│ Topup yang salah tidak bisa direfund.\n│\n' +
      '│ Balas pesan ini:\n' +
      '│ *ya* — lanjutkan\n' +
      '│ *tidak* — batal\n' +
      '╰──────────────────────'

    const msg = await m.reply(txt)
    conn.ffSession[m.sender] = {
      id: msg.key.id,
      target: target,
      userId: userId,
      server: server,
      produk: produk,
      chat: m.chat,
      isGroup: m.isGroup,
      created: Date.now()
    }

  } catch (e) {
    return m.reply('❌ Terjadi kesalahan. Coba lagi.')
  }
}

// ══════════════════════════════════════════
// BEFORE HANDLER (konfirmasi ya/tidak)
// ══════════════════════════════════════════

handler.before = async function(m, opts) {
  const conn = opts.conn
  conn.ffSession = conn.ffSession || {}

  const session = conn.ffSession[m.sender]
  if (!session) return
  if (!m.quoted || m.quoted.id !== session.id) return
  if (!m.text) return

  const jawaban = String(m.text).trim().toLowerCase()
  if (jawaban !== 'ya' && jawaban !== 'tidak') return

  if (Date.now() - Number(session.created || 0) > 120000) {
    resetSesi(conn, m.sender)
    return m.reply('⏰ Konfirmasi kadaluarsa. Ulangi dari awal.')
  }

  if (jawaban === 'tidak') {
    resetSesi(conn, m.sender)
    return m.reply('❌ Topup dibatalkan.')
  }

  // ── PROSES ───────────────────────────────────────────────
  const user = userData(m.sender)
  const produk = session.produk

  if (user.saldo < produk.price) {
    resetSesi(conn, m.sender)
    return m.reply('❌ Saldo tidak cukup.')
  }

  user.saldo -= produk.price
  resetSesi(conn, m.sender)

  await m.reply('⏳ Sedang memproses topup...')

  try {
    const res = await axios.get('https://www.rumahotp.com/api/v1/h2h/transaction/create', {
      headers: { 'x-apikey': getKey(), Accept: 'application/json' },
      params: { product_code: produk.code, target: session.target },
      timeout: 60000
    })

    const data = res.data

    // ── GAGAL ───────────────────────────────────────────────
    if (!data.success || !data.data) {
      user.saldo += produk.price // refund

      const gagalMsg =
        '╭─── ❌ *TOPUP GAGAL* ───\n│\n' +
        '│ Produk : ' + produk.name + '\n' +
        '│ ID FF  : ' + session.userId + '\n' +
        (session.server ? '│ Server : ' + session.server + '\n' : '') +
        '│ Alasan : ' + ((data && data.error && data.error.message) || 'Terjadi kesalahan') + '\n│\n' +
        '│ 💰 Saldo *' + rupiah(produk.price) + '* dikembalikan\n' +
        '│ Saldo saat ini: ' + rupiah(user.saldo) + '\n' +
        '╰──────────────────────'

      await conn.sendMessage(session.chat, { text: gagalMsg }, { quoted: m })

      if (session.isGroup) {
        await conn.sendMessage(session.chat, {
          text: '⚠️ @' + m.sender.split('@')[0] + ' Topup *' + produk.name + '* ke ID *' + session.userId + '* gagal. Saldo dikembalikan.',
          mentions: [m.sender]
        })
      }
      return
    }

    // ── BERHASIL ─────────────────────────────────────────────
    const d = data.data
    const waktu = now()

    const struk =
      '╭────────────────────────\n' +
      '│   🔥 *STRUK TOPUP FF*\n' +
      '├────────────────────────\n' +
      '│ ✅ Topup Berhasil!\n' +
      '│\n' +
      '│ 📦 Produk\n' +
      '│    ' + produk.name + '\n' +
      '│\n' +
      '│ 👤 ID Free Fire\n' +
      '│    ' + session.userId + '\n' +
      (session.server ? '│ 🌐 Server : ' + session.server + '\n' : '') +
      '│\n' +
      '│ 💳 Pembayaran\n' +
      '│    ' + rupiah(produk.price) + '\n' +
      '│\n' +
      '│ 💰 Sisa Saldo\n' +
      '│    ' + rupiah(user.saldo) + '\n' +
      '│\n' +
      (d.sn ? '│ 🔖 SN : ' + d.sn + '\n│\n' : '') +
      '│ 🕐 Waktu\n' +
      '│    ' + waktu + '\n' +
      '│\n' +
      '│ 🧾 ID Transaksi\n' +
      '│    ' + (d.transaction_id || '-') + '\n' +
      '╰────────────────────────'

    await conn.sendMessage(session.chat, { text: struk }, { quoted: m })

    // Notif grup
    if (session.isGroup) {
      await conn.sendMessage(session.chat, {
        text:
          '🔥 *TOPUP FF BERHASIL!*\n\n' +
          '👤 @' + m.sender.split('@')[0] + '\n' +
          '💎 ' + produk.name + '\n' +
          '🎮 ID: ' + session.userId + '\n\n' +
          'Mau topup juga? Ketik *.ff*',
        mentions: [m.sender]
      })
    }

  } catch (e) {
    user.saldo += produk.price // refund

    const errMsg =
      '╭─── ❌ *TOPUP GAGAL* ───\n│\n' +
      '│ Produk : ' + produk.name + '\n' +
      '│ ID FF  : ' + session.userId + '\n' +
      '│ Alasan : Server error\n│\n' +
      '│ 💰 Saldo *' + rupiah(produk.price) + '* dikembalikan\n' +
      '│ Saldo saat ini: ' + rupiah(user.saldo) + '\n' +
      '╰──────────────────────'

    await conn.sendMessage(session.chat, { text: errMsg }, { quoted: m })

    if (session.isGroup) {
      await conn.sendMessage(session.chat, {
        text: '⚠️ @' + m.sender.split('@')[0] + ' Topup *' + produk.name + '* gagal (server error). Saldo dikembalikan.',
        mentions: [m.sender]
      })
    }
  }
}

handler.help = ['ff <nomor> <id_ff> [server]']
handler.tags = ['store']
handler.command = /^(ff|freefire)$/i
module.exports = handler
