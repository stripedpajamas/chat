const { InMemoryLogStore } = require('./logstore')
// const { Log, LogMemoryDriver } = require('./log')
const keypair = require('./keypair')
const { createEntry, verifyEntry } = require('./entry')

const keys = keypair.generate()

const logstore = new InMemoryLogStore()

const content = msg('hello world')

console.error({ content })

const entry = createEntry(keys.sk, content)

console.error({ entry })

const { valid, reason } = verifyEntry(keys.pk, entry)

console.error({ valid })

logstore.addEntry(keys.pk, entry)

console.error(logstore.entries())

function msg (text) {
  return {
    timestamp: Date.now(),
    channel: null,
    text
  }
}

module.exports = { msg, keys, logstore }
