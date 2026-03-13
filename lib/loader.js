// ==============================
// lib/loader.js — Plugin Loader
// ==============================

const fs = require('fs')
const path = require('path')

const plugins = new Map()

/**
 * Load semua plugin dari folder /plugins
 */
function loadPlugins() {
  const pluginDir = path.join(__dirname, '../plugins')
  const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'))

  let success = 0
  let failed = 0
  const errors = []

  // Clear dulu
  plugins.clear()

  for (const file of files) {
    try {
      // Delete cache biar bisa reload
      delete require.cache[require.resolve(path.join(pluginDir, file))]
      const plugin = require(path.join(pluginDir, file))

      if (!plugin.handler || !plugin.command) {
        throw new Error('Missing handler or command')
      }

      plugins.set(file, plugin)
      success++
    } catch (e) {
      failed++
      errors.push({ file, error: e.message })
    }
  }

  // Summary
  console.log(`\n✅ ${success} plugin berhasil dimuat`)
  if (failed > 0) {
    console.log(`❌ ${failed} plugin gagal dimuat:`)
    for (const e of errors) {
      console.log(`  • ${e.file}: ${e.error}`)
    }
  }
  console.log('')

  return { success, failed, errors }
}

/**
 * Cari plugin yang cocok dengan command
 */
function findPlugin(command) {
  for (const [, plugin] of plugins) {
    if (plugin.command instanceof RegExp && plugin.command.test(command)) {
      return plugin
    }
    if (typeof plugin.command === 'string' && plugin.command === command) {
      return plugin
    }
  }
  return null
}

/**
 * Get semua plugin (untuk menu)
 */
function getAllPlugins() {
  return [...plugins.values()]
}

module.exports = { loadPlugins, findPlugin, getAllPlugins }