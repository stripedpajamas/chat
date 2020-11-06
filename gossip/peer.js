const { Feed } = require('./data')

class Peer {
  constructor ({ id }) {
    this.id = id
    this.feeds = new Map()

    this.feeds.set(this.id, new Feed({ id }))
  }

  subscribeToFeed ({ id }) {
    if (this.feeds.has(id)) return
    this.feeds.set(id, new Feed({ id }))
  }
}
