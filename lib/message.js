// ==============================
// lib/message.js — Message Helper
// ==============================

const { proto, generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys')

/**
 * Serialize pesan masuk jadi object yang lebih mudah dipakai
 */
function serialize(msg, sock) {
  if (!msg.message) return msg

  const type = Object.keys(msg.message)[0]
  const content = msg.message[type]

  // Ambil teks dari berbagai tipe pesan
  let body = ''
  if (type === 'conversation') body = content
  else if (type === 'extendedTextMessage') body = content.text
  else if (type === 'imageMessage') body = content.caption || ''
  else if (type === 'videoMessage') body = content.caption || ''
  else if (type === 'buttonsResponseMessage') body = content.selectedButtonId
  else if (type === 'listResponseMessage') body = content.singleSelectReply?.selectedRowId

  const from = msg.key.remoteJid
  const isGroup = from?.endsWith('@g.us')
  const sender = isGroup ? msg.key.participant : from
  const senderNumber = sender?.replace(/[^0-9]/g, '')

  // Reply function
  msg.reply = async (text) => {
    return sock.sendMessage(from, { text: String(text) }, { quoted: msg })
  }

  // Send tanpa quote
  msg.send = async (text) => {
    return sock.sendMessage(from, { text: String(text) })
  }

  // React dengan emoji
  msg.react = async (emoji) => {
    return sock.sendMessage(from, {
      react: { text: emoji, key: msg.key }
    })
  }

  return {
    ...msg,
    type,
    body,
    from,
    isGroup,
    sender,
    senderNumber,
  }
}

module.exports = { serialize }
