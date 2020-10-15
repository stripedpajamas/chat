const keypair = require('./keypair')
const { InMemoryLogStore } = require('./logstore')
const { createEntry } = require('./entry')

function Node () {
  const keys = keypair.generate()
  const logstore = new InMemoryLogStore()

  console.error('Initialized node id %s', keys.pk)
  return {
    newMsg (text) {
      const entry = createEntry(keys.sk, {
        timestamp: Date.now(),
        channel: null,
        text
      })
      logstore.addEntry(keys.pk, entry)
      console.error('Added msg to node %s (%s)', keys.pk, entry.content.text)
    },
    keys,
    logstore,
  }
}

module.exports = Node
