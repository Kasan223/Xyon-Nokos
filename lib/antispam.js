// ==============================
// lib/antispam.js — Anti Spam/Flood
// ==============================

const config = require('../config')

// Map: senderNumber → { count, lastReset, warned }
const spamMap = new Map()

/**
 * Cek apakah sender sedang spam
 * Returns true kalau spam, false kalau aman
 */
function isSpam(senderNumber) {
  const now = Date.now()
  const data = spamMap.get(senderNumber) || { count: 0, lastReset: now, warned: false }

  // Reset counter kalau sudah lewat window
  if (now - data.lastReset > config.spamWindow) {
    data.count = 0
    data.lastReset = now
    data.warned = false
  }

  data.count++
  spamMap.set(senderNumber, data)

  return data.count > config.spamLimit
}

/**
 * Cek apakah sudah diperingatkan (biar tidak spam warning juga)
 */
function isWarned(senderNumber) {
  return spamMap.get(senderNumber)?.warned || false
}

/**
 * Set status warned
 */
function setWarned(senderNumber) {
  const data = spamMap.get(senderNumber)
  if (data) {
    data.warned = true
    spamMap.set(senderNumber, data)
  }
}

/**
 * Reset spam counter (misal setelah timeout)
 */
function resetSpam(senderNumber) {
  spamMap.delete(senderNumber)
}

// Auto cleanup map setiap 1 menit
setInterval(() => {
  const now = Date.now()
  for (const [key, data] of spamMap.entries()) {
    if (now - data.lastReset > config.spamWindow * 2) {
      spamMap.delete(key)
    }
  }
}, 60_000)

module.exports = { isSpam, isWarned, setWarned, resetSpam }