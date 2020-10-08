// Log is a grow-only set of Entries
class Log {
  constructor (storageDriver) {
    this.storage = storageDriver
  }

  add (entry) {
    this.storage.add(entry)
  }

  toJSON () {
    return this.storage.toJSON()
  }
}

class LogMemoryDriver {
  constructor () {
    this.data = new Map()
  }

  add (entry) {
    const { hash } = entry
    this.data.set(hash, entry)
  }

  values () {
    return this.data.values()
  }

  toJSON () {
    return [...this.data.values()]
  }
}

module.exports = { Log, LogMemoryDriver }
