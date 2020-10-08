const { Log, LogMemoryDriver } = require('./log')
const keypair = require('./keypair')
const { createEntry, verifyEntry } = require('./entry')

const keys = keypair.generate()

const memoryDriver = new LogMemoryDriver()
const log = new Log(memoryDriver)

const content = {
  timestamp: Date.now(),
  channel: null,
  text: 'hello world'
}

console.error({ content })

const entry = createEntry(keys.sk, content)

console.error({ entry })

const { valid, reason } = verifyEntry(keys.pk, entry)

console.error({ valid })

log.add(entry)

console.error(JSON.stringify(log))

