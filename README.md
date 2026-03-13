# 🤖 XyonBot — WhatsApp Bot
> by kasanvx | Powered by Baileys

---

## 📁 Struktur Project

```
wabot/
├── index.js              ← Entry point utama
├── config.js             ← Konfigurasi bot
├── package.json
├── lib/
│   ├── message.js        ← Serialize & helper pesan
│   ├── loader.js         ← Plugin loader + hot reload
│   └── antispam.js       ← Anti spam / flood
├── plugins/              ← Taruh semua plugin di sini
│   ├── menu.js
│   ├── nokos.js
│   ├── deposit.js
│   └── menu.js
└── sessions/             ← Data sesi WhatsApp (auto dibuat)
```

---

## ⚙️ Instalasi

```bash
# 1. Masuk ke folder project
cd wabot

# 2. Install dependencies
npm install

# 3. Edit konfigurasi
nano config.js

# 4. Jalankan bot
node index.js
```

Scan QR yang muncul di terminal pakai WhatsApp kamu.

---

## 🔧 Konfigurasi (`config.js`)

```js
module.exports = {
  botName: 'XyonBot',           // Nama bot
  prefix: ['.', '!', '/'],      // Prefix command
  ownerNumber: ['628xxx'],       // Nomor owner format 628xxx
  spamLimit: 5,                  // Maks pesan per window
  spamWindow: 5000,              // Window anti spam (ms)
  autoReply: true,               // Auto reply sapaan di DM
  sessions: ['main'],            // Daftar sesi aktif
}
```

### Multi Sesi
Tambah session ID di `config.js`:
```js
sessions: ['main', 'second', 'third']
```
Setiap sesi akan tampil QR tersendiri di terminal.

---

## 💰 Setup RumahOTP

1. Daftar di [rumahotp.com](https://rumahotp.com)
2. Login → Dashboard → ambil **API Key**
3. Set di `index.js` sebelum bot jalan:

```js
global.rumahotp = 'API_KEY_KAMU'
```

Atau pakai environment variable:
```bash
RUMAHOTP_APIKEY=xxxxx node index.js
```

---

## 🚀 PM2 (Jalan di Background)

Install PM2:
```bash
npm install -g pm2
```

Jalankan bot:
```bash
pm2 start index.js --name xyonbot
```

Perintah berguna:
```bash
pm2 logs xyonbot        # lihat log
pm2 restart xyonbot     # restart
pm2 stop xyonbot        # stop
pm2 delete xyonbot      # hapus dari pm2
pm2 save                # simpan list process
pm2 startup             # auto start saat reboot
```

---

## 🔁 Nodemon (Auto Restart saat Development)

```bash
npm run dev
```

Bot otomatis restart setiap kali ada perubahan file.

---

## 🔌 Cara Tambah Plugin

Buat file baru di folder `plugins/`, contoh `plugins/ping.js`:

```js
let handler = async (m, { args, usedPrefix, command }) => {
  await m.reply('Pong! 🏓')
}

handler.help = ['ping']
handler.tags = ['tools']
handler.command = /^(ping)$/i

module.exports = handler
```

Simpan file → plugin langsung aktif tanpa restart (hot reload).

### Properti Plugin

| Properti | Wajib | Keterangan |
|----------|-------|------------|
| `handler` | ✅ | Fungsi utama |
| `handler.command` | ✅ | Regex command |
| `handler.help` | ❌ | Muncul di `.menu` |
| `handler.tags` | ❌ | Kategori di menu |
| `handler.ownerOnly` | ❌ | Khusus owner |
| `handler.groupOnly` | ❌ | Khusus grup |
| `handler.before` | ❌ | Jalan sebelum command diproses |

---

## 📦 Dependencies

| Package | Keterangan |
|---------|------------|
| `@whiskeysockets/baileys` | Library WhatsApp |
| `pino` | Logger |
| `axios` | HTTP client |
| `cheerio` | HTML parser (scraping) |
| `@hapi/boom` | Error handler |
| `nodemon` | Auto restart (dev) |

---

> Made with ❤️ by kasanvx
