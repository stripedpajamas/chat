// rss style, kinda
// subscriber reaches out to all publishers for content
// publishers send back 

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
  for (const peer of config.peers) {
    const { port, host, id } = peer

    const conn = handleConnection(jsonStream(net.connect(port, host)))

    // request from the peer their own data
    logger.info(`Requesting sync of ${id}`)
    conn.syncFeed(id)
    conn.close()
  }
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
            // send a log to requester
            const [feedId] = params
            logger.info(`Sync requested for ${feedId}`)
            if (!local.feeds.has(feedId)) {
              // we don't have the feed
              conn.write(errorResponse(msgId, 'Feed not found'))
              break
            }

            const log = local.feeds.get(feedId).log.getData()
            conn.write(dataResponse(msgId, log))
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
            const [id] = params
            const log = data
            const feed = local.feeds.get(id)
            if (!feed) {
              logger.warn(`Received data that we do not care about (feed id: ${id})`)
              break
            }

            logger.info(`Received ${log.length} entries for feed ${id}`)
            log.slice(feed.getLatestSeq()).forEach((newEntry) => {
              logger.info(`Adding entry to ${id}'s log`)
              const { content } = newEntry
              feed.append(content)
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

  function syncFeed (id) {
    const method = SYNC
    const params = [id]
    const msgId = Math.random().toString(36).slice(2)
    reqs.set(msgId, { method, params })

    conn.write([DATA_REQ_MSG, msgId, method, params])
  }

  return {
    syncFeed,
    close
  }
}
