class Feed {
  constructor ({ log, id }) {
    this.id = id
    this.log = log || (new MemoryLog({ id }))
  }

  append (content) {
    this.log.append(content)
  }
}

class MemoryLog {
  constructor ({ id }) {
    this.id = id
    this.data = []
  }

  append (content) {
    this.data.push({
      id: this.id,
      seq: this.data.length,
      content,
    })
  }

  getData () {
    return this.data
  }
}

module.exports = { Feed }
