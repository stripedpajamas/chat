// rss style, kinda
// subscriber reaches out to all publishers for content
// publishers send back 

const net = require('net')
const jsonStream = require('duplex-json-stream')
const logger = require('pino')()
const { Peer } = require('./peer')

/* for testing */
const config = require('./config')(process.argv[2])
const local = new Peer({ id: config.id })

logger.info(`i am ${config.id}; subscribing to ${config.otherId}`)
local.subscribeToFeed({ id: config.otherId })
const myFeed = local.feeds.get(config.id)

// for testing, add stuff to my log
setInterval(() => {
  myFeed.append(`hello from ${config.id} at ${new Date()}`)
}, Math.random() * 1000 + 1000)

// for testing, call peers and ask
// for the feeds i follow
setInterval(() => {
  for (const peer of config.peers) {
    const { address, port } = peer
    logger.info(`Attempting connection to ${address}:${port}`)

    const conn = new Connection({
      local,
      socket: net.connect(port, address),
      initiateHello: true
    })

    conn.sync(config.otherId)
    conn.end()
  }
}, 10000)
/* end testing */

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
    POST: 'post'
  }
}

server.on('connection', (socket) => {
  const conn = jsonStream(socket)

  const { HANDSHAKE_MSG, DATA_REQ_MSG, DATA_RES_MSG, METHODS } = protocol
  const { SYNC, POST } = METHODS

  function errorResponse (msgId, err) {
    return [DATA_RES_MSG, msgId, err, null]
  }

  function dataResponse (msgId, data) {
    return [DATA_RES_MSG, msgId, null, data]
  }

  conn.on('data', (msg) => {
    switch (msg.type) {
      case HANDSHAKE_MSG: {} // handshake msg
      case DATA_REQ_MSG: { // authenticated request msg
        const [type, msgId, method, params] = msg
        switch (method) {
          case SYNC: {
            // send a log to requester
            const [feedId] = params
            if (!local.feeds.has(feedId)) {
              // we don't have the feed
              conn.write(errorResponse(msgId, 'Feed not found'))
              break
            }

            const log = local.feeds.get(feedId).log.getData()
            conn.write(dataResponse(msgId, log))
            break
          }
          case 'post': {
            // append to local log
            break
          }
          default: {
            break
          }
        }
      } 
      case DATA_RES_MSG: {} // authenticated response to a req
    }
  })
})

