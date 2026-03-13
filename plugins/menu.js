// ==============================
// plugins/menu.js
// ==============================

const { getAllPlugins } = require('../lib/loader')
const config = require('../config')

let handler = async (m, { usedPrefix }) => {
  const plugins = getAllPlugins()

  // Kelompokkan berdasarkan tags
  const grouped = {}
  for (const plugin of plugins) {
    const tag = plugin.tags?.[0] || 'other'
    if (!grouped[tag]) grouped[tag] = []
    if (plugin.help) {
      const helps = Array.isArray(plugin.help) ? plugin.help : [plugin.help]
      grouped[tag].push(...helps.map(h => `${usedPrefix}${h}`))
    }
  }

  const tagEmoji = {
    tools:  '🛠️',
    fun:    '🎉',
    info:   'ℹ️',
    owner:  '👑',
    other:  '📦',
  }

  let txt = `╭─────────────────
│ 🤖 *${config.botName}*
│ Prefix: ${config.prefix.join(' ')}
╰─────────────────\n`

  for (const [tag, cmds] of Object.entries(grouped)) {
    if (!cmds.length) continue
    const emoji = tagEmoji[tag] || '📦'
    txt += `\n${emoji} *${tag.toUpperCase()}*\n`
    for (const cmd of cmds) {
      txt += `  ┃ ${cmd}\n`
    }
  }

  txt += `\n╰─────────────────`

  await m.reply(txt)
}

handler.help = ['menu', 'help']
handler.tags = ['info']
handler.command = /^(menu|help|start)$/i

module.exports = handler