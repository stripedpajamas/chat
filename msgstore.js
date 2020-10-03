class MsgStore {
  constructor () {
    this.feeds = new Map() // person ID => Set(message ID)
    this.msgs = new Map() // message ID => message content

    this.deltaGroup = new Map() // delta ID => state ({ feeds, msgs })
    this.appliedDeltas = new Set() // { delta ID }
  }

  getDeltas () {
    return this.deltaGroup
  }

  getSerializedDeltas () {
    const serialized = {}

    for (const [k, v] of this.getDeltas().entries()) {
      serialized[k] = v
    }

    for (const deltaId in serialized) {
      const { feeds, msgs } = serialized[deltaId]
      serialized[deltaId] = { feeds: {}, msgs: {} }
      for (const [feedId, msgIds] of feeds.entries()) {
        serialized[deltaId].feeds[feedId] = [...msgIds.values()]
      }
      for (const [msgId, msg] of msgs.entries()) {
        serialized[deltaId].msgs[msgId] = msg
      }
    }

    return serialized
  }

  clearDeltas () {
    this.deltaGroup.clear()
  }

  getState () {
    return { feeds: this.feeds, msgs: this.msgs }
  }

  add (msg) {
    const msgId = Math.random().toString(36).slice(2)
    const { fromId } = msg

    if (!this.feeds.has(fromId)) {
      this.feeds.set(fromId, new Set())
    }
    this.feeds.get(fromId).add(msgId)
    this.msgs.set(msgId, msg)

    // add delta to local delta group
    const deltaId = Math.random().toString(36).slice(2)
    
    this.deltaGroup.set(deltaId, {
      feeds: new Map([[fromId, new Set([msgId])]]),
      msgs: new Map([[msgId, msg]])
    })
  }

  allMsgs () {
    const all = new Set()
    for (const [fromId, msgIds] of this.feeds.entries()) {
      for (const msgId of msgIds) {
        all.add(this.msgs.get(msgId))
      }
    }
    return all
  }

  mergeSerializedDeltas (serialized) {
    const deltaGroup = new Map()
    for (const deltaId in serialized) {
      const feeds = new Map()
      const msgs = new Map()
      for (const feedId in serialized[deltaId].feeds) {
        const msgIds = new Set(serialized[deltaId].feeds[feedId])
        feeds.set(feedId, msgIds)
      }
      for (const msgId in serialized[deltaId].msgs) {
        msgs.set(msgId, serialized[deltaId].msgs[msgId])
      }
      deltaGroup.set(deltaId, { feeds, msgs })
    }
    this.mergeDeltas(deltaGroup)
  }

  mergeDeltas (deltas) {
    for (const [deltaId, delta] of deltas.entries()) {
      if (this.appliedDeltas.has(deltaId)) continue
      this.merge(delta)
      this.appliedDeltas.add(deltaId)
    }
  }

  merge (otherState) {
    const { feeds, msgs } = otherState

    // local node's msgs are set to the union of node's msgs with other's msgs
    for (const [msgId, msg] of msgs.entries()) {
      this.msgs.set(msgId, msg)
    }

    // similarly for the feeds
    for (const [feedId, msgIds] of feeds.entries()) {
      if (!this.feeds.has(feedId)) {
        this.feeds.set(feedId, new Set())
      }
      const localFeed = this.feeds.get(feedId)
      for (const msgId of msgIds) {
        localFeed.add(msgId)
      }
    }
  }
}

module.exports = MsgStore

