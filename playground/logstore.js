const { verifyEntry } = require('./entry')

// Log Store is a replicated k/v store of logs
class InMemoryLogStore {
  constructor ({ logFactory } = {}) {
    this.data = new Map()

    if (logFactory) {
      this.logFactory = logFactory
    } else {
      this.logFactory = () => new InMemoryLog()
    }
  }

  newLog (logId) {
    this.data.set(logId, this.logFactory())
    return this.data.get(logId)
  }

  addEntry (logId, entry) {
    const log = this.data.has(logId)? this.data.get(logId) : this.newLog(logId)

    if (log.has(entry)) return
    
    const { valid, reason } = verifyEntry(logId, entry)
    if (!valid) {
      throw new Error('Could not verify log entry: ' + reason)
    }

    log.add(entry)
  }

  entries () {
    const entries = []
    for (const [id, log] of this.data.entries()) {
      for (const entry of log.entries()) {
        entries.push({ id, ...entry })
      }
    }
    return entries
  }

  // given another logstore, merge it into this one
  // this method expects JSON.parse(JSON.stringify(logstore))
  merge (logstore) {
    for (const id in logstore) {
      const log = logstore[id]
      for (const entry of log) {
        this.addEntry(id, entry)
      }
    }
  }

  toJSON () {
    const logs = {}
    for (const [id, log] of this.data.entries()) {
      logs[id] = log.toJSON()
    }
    return logs
  }
}

// Represents a single in-memory Log
class InMemoryLog {
  constructor () {
    this.data = new Map()
  }

  add (entry) {
    const { hash } = entry
    this.data.set(hash, entry)
  }

  has (entry) {
    return this.data.has(entry.hash)
  }

  entries () {
    return this.data.values()
  }

  toJSON () {
    return [...this.data.values()]
  }
}

module.exports = {
  InMemoryLogStore
}

