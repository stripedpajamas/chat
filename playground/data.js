const { verifyEntry } = require('./entry')

// DB contains the set of stored log IDs, as well as the log store
class InMemoryDB {
  constructor () {
    this.logset = new Set()

    this.logstore = new InMemoryLogStore({
      logFactory: () => new InMemoryLog(),
      shouldStoreLog: (logId) => this.logset.has(logId)
    })
  }

  addLogId (id) {
    this.logset.add(id)
  }

  hasLogId (id) {
    return this.logset.has(id)
  }

  addEntry (id, entry) {
    this.logstore.addEntry(id, entry)
  }

  entries () {
    return this.logstore.entries()
  }

  getSyncData () {
    return JSON.stringify(this.logstore)
  }

  mergeSyncData (data) {
    const parsed = JSON.parse(data)
    this.logstore.merge(parsed)
  }
}

// Log Store is a replicated k/v store of logs
class InMemoryLogStore {
  constructor ({ logFactory, shouldStoreLog } = {}) {
    this.data = new Map()

    if (logFactory) {
      this.logFactory = logFactory
    } else {
      this.logFactory = () => new InMemoryLog()
    }

    if (shouldStoreLog) {
      this.shouldStoreLog = shouldStoreLog
    } else {
      this.shouldStoreLog = () => true
    }
  }

  newLog (logId) {
    this.data.set(logId, this.logFactory())
    return this.data.get(logId)
  }

  addEntry (logId, entry) {
    if (!this.shouldStoreLog(logId)) return

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
  InMemoryDB,
  InMemoryLogStore,
  InMemoryLog
}

