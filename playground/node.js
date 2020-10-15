
const pino = require('pino')
const keypair = require('./keypair')
const { InMemoryDB } = require('./data')
const { createEntry } = require('./entry')

class Node {
  constructor ({ keys, db, logger }) {
    this.keys = keys || keypair.generate()
    this.db = db || (new InMemoryDB())
    this.logger = logger || pino()

    // add self to stored logs
    this.db.addLogId(this.keys.pk)

    this.logger.info('Initialized node id %s', this.keys.pk)
  }

  id () {
    return this.keys.pk
  }

  addLogId (id) {
    this.db.addLogId(id)
  }

  addMsg ({ text, channel }) {
    const entry = createEntry(this.keys.sk, { timestamp: Date.now(), channel, text })
    this.db.addEntry(this.id(), entry)
    this.logger.info('Added msg to node %s', this.id())
  }

  getMessages () {
    return this.db.entries()
  }
}

module.exports = Node

