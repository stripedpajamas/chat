// choose one peer randomly; send a map of IDs and sequence numbers
// on the other side, send back a map of IDs and log entries (> received seq)

const net = require('net')
const jsonStream = require('duplex-json-stream')
const logger = require('pino')()
const { Peer } = require('./peer')

const config = require('./config')(process.argv[2])
const local = new Peer({ id: config.id })

const server = net.createServer()
server.listen(config.port, () => {
  logger.info(`Listening on ${config.port}`)
})

const protocol = {
  HANDSHAKE_MSG: 0,
  DATA_REQ_MSG: 1,
  DATA_RES_MSG: 2,
  METHODS: {
    SYNC: 'sync',
    POST: 'post',
    DUMP: 'dump',
    FOLLOW: 'follow',
  }
}

function sync () {
  const peer = config.peers[Math.floor(Math.random() * config.peers.length)]
  const { port, host } = peer

  const conn = handleConnection(jsonStream(net.connect(port, host)))

  // request from the peer their own data
  logger.info('Requesting sync of subscribed feeds')
  conn.syncFeeds(local.feeds)
  conn.close()
}

setInterval(sync, 10000)

server.on('connection', (socket) => {
  logger.info('Incoming connection')
  handleConnection(jsonStream(socket))
})

function handleConnection (conn) {
  const { HANDSHAKE_MSG, DATA_REQ_MSG, DATA_RES_MSG, METHODS } = protocol
  const { SYNC, POST, DUMP, FOLLOW } = METHODS

  function errorResponse (msgId, err) {
    return [DATA_RES_MSG, msgId, err, null]
  }

  function dataResponse (msgId, data) {
    return [DATA_RES_MSG, msgId, null, data]
  }

  const reqs = new Map()

  conn.on('error', (e) => {
    reqs.clear()
    logger.warn(e)
  }) 
  conn.on('close', () => { logger.info('Connection closed') })
  conn.on('data', (msg) => {
    switch (msg[0]) {
      case HANDSHAKE_MSG: {} // handshake msg (TODO do it)
      case DATA_REQ_MSG: { // authenticated request msg
        const [type, msgId, method, params] = msg
        switch (method) {
          case SYNC: {
            // request received to sync up a feed
            const [idSeqs] = params

            logger.info(`Sync requested for ${idSeqs.length} feeds`)

            const payload = idSeqs
              .filter(([id, seq]) => local.feeds.has(id))
              .map(([id, seq]) => [id, local.feeds.get(id).log.getData().slice(seq + 1)])
              .filter(([id, log]) => log.length > 0) // don't send back empty stuff

            logger.info(`Responding with ${payload.length} feed diffs`)
            conn.write(dataResponse(msgId, payload))
            break
          }
          case POST: {
            // append to local log
            const [post] = params
            local.feeds.get(local.id).append(post)
            conn.write(dataResponse(msgId, { success: 1 }))
            break
          }
          case FOLLOW: {
            // subscribe to another id
            const [feedId] = params
            local.subscribeToFeed({ id: feedId })
            conn.write(dataResponse(msgId, { success: 1 }))
            break
          }
          case DUMP: {
            // dump everything (for testing)
            conn.write(dataResponse(msgId, [...local.feeds.entries()]))
            break
          }
          default: {
            break
          }
        }
        break
      } 
      case DATA_RES_MSG: { // authenticated response to a req
        const [type, msgId, err, data] = msg
        if (err) {
          logger.error(`Error in response to msg ${msgId}`, err)
          break
        }
        if (!reqs.has(msgId)) {
          logger.error(`Receieved a response to a msg we don't know about (${msgId})`)
          break
        }

        const { method, params } = reqs.get(msgId)
        reqs.delete(msgId)

        switch (method) {
          case SYNC: {
            data.forEach(([id, log]) => {
              const feed = local.feeds.get(id)
              if (!feed) {
                logger.warn(`Received data that we do not care about (feed id: ${id})`)
                return
              }
              logger.info(`Received ${log.length} entries for feed ${id}`)
              const latestSeq = feed.getLatestSeq()
              const beginIdx = log.findIndex(entry => entry.seq === latestSeq)

              if (beginIdx < 0) {
                logger.warn(`We already have everything the peer has sent for ${id}`)
                return
              }

              log.slice(beginIdx).forEach((entry) => {
                logger.info(`Adding entry to ${id}'s log`)
                const { content } = entry
                feed.append(content)
              })
            })
            break
          }
          default: {
            break
          }
        }
        break
      }
    }
  })

  function close (retriesRemaining = 5) {
    if (reqs.size) {
      logger.warn('Requests open on connection; waiting 1s and then trying again')
      setTimeout(() => close(retriesRemaining - 1), 1000)
      return
    }

    reqs.clear()
    conn.end()
  }

  function syncFeeds (feeds) {
    const idSeqs = []
    for (const [id, log] of feeds.entries()) {
      if (id === local.id) continue
      idSeqs.push([id, log.getLatestSeq() - 1])
    }

    if (!idSeqs.length) return

    const method = SYNC
    const params = [idSeqs]
    const msgId = Math.random().toString(36).slice(2)
    reqs.set(msgId, { method, params })

    conn.write([DATA_REQ_MSG, msgId, method, params])
  }

  return {
    syncFeeds,
    close
  }
}
