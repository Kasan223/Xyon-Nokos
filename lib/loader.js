// ==============================
// lib/loader.js — Plugin Loader
// ==============================

const fs = require('fs')
const path = require('path')

const plugins = new Map()

/**
 * Normalize plugin export:
 * Support module.exports = handler (fungsi langsung, dengan .command, .tags, dll)
 * atau module.exports = { handler, command, ... }
 */
function normalizePlugin(plugin) {
  if (typeof plugin === 'function') {
    if (!plugin.command) throw new Error('Missing command on handler')
    return {
      handler: plugin,
      before: plugin.before || null,
      command: plugin.command,
      help: plugin.help || [],
      tags: plugin.tags || [],
      ownerOnly: plugin.ownerOnly || false,
      groupOnly: plugin.groupOnly || false
    }
  }

  if (typeof plugin === 'object' && typeof plugin.handler === 'function') {
    if (!plugin.command) throw new Error('Missing command')
    return plugin
  }

  throw new Error('Missing handler or command')
}

/**
 * Load semua plugin dari folder /plugins
 */
function loadPlugins() {
  const pluginDir = path.join(__dirname, '../plugins')
  const files = fs.readdirSync(pluginDir).filter(function(f) { return f.endsWith('.js') })

  let success = 0
  let failed = 0
  const errors = []

  plugins.clear()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      const filePath = path.join(pluginDir, file)
      delete require.cache[require.resolve(filePath)]
      const raw = require(filePath)
      const plugin = normalizePlugin(raw)
      plugins.set(file, plugin)
      success++
    } catch (e) {
      failed++
      errors.push({ file: file, error: e.message })
    }
  }

  console.log('\n✅  ' + success + ' plugin berhasil dimuat')
  if (failed > 0) {
    console.log('❌  ' + failed + ' plugin gagal dimuat:')
    for (let j = 0; j < errors.length; j++) {
      console.log('  • ' + errors[j].file + ': ' + errors[j].error)
    }
  }
  console.log('')

  return { success: success, failed: failed, errors: errors }
}

/**
 * Cari plugin yang cocok dengan command
 */
function findPlugin(command) {
  for (const entry of plugins) {
    const plugin = entry[1]
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
  const result = []
  for (const entry of plugins) {
    result.push(entry[1])
  }
  return result
}

module.exports = { loadPlugins: loadPlugins, findPlugin: findPlugin, getAllPlugins: getAllPlugins }
