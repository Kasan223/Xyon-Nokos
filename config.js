// ==============================
// KONFIGURASI BOT
// ==============================

module.exports = {
  // Nama bot
  botName: 'XyonBot',

  // Prefix command (bisa array)
  prefix: ['.', '!', '/'],

  // Nomor owner (format: 628xxx)
  ownerNumber: ['628xxxxxxxxxx'],

  // Anti spam: max pesan per detik per user
  spamLimit: 5,       // max 5 pesan
  spamWindow: 5000,   // dalam 5 detik

  // Auto reply saat bot offline/loading
  autoReply: true,

  // Sesi (nama folder di /sessions)
  sessionId: 'main',

  // Multi sesi — tambah session ID di sini
  sessions: ['main'], // ['main', 'second', 'third']
}