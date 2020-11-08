// rss style, kinda
// subscriber reaches out to all publishers for content
// publishers send back 

const net = require('net')
const logger = require('pino')()
const cbor = require('cbor')
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

// for testing, randomly call peers and ask
// for the feeds i follow
if (config.id === 'pete') {
  setTimeout(() => {
    for (const peer of config.peers) {
      const { address, port } = peer
      logger.info({ address, port }, 'Attempting connection')

      const conn = new Connection({
        local,
        socket: net.connect(port, address),
        initiateHello: true
      })

      conn.sync(config.otherId)
      conn.end()
    }
  }, Math.random() * 5000 + 3000)
}
/* end testing */

const server = net.createServer()
server.listen(config.port, () => {
  logger.info(`Listening on ${config.port}`)
})

server.on('connection', (socket) => {
  const conn = new Connection({ socket, local })
})

class Connection {
  constructor ({ socket, local, initiateHello }) {
    this.local = local
    this.socket = socket
    this.received = Buffer.alloc(0)
    this.alive = true

    this.helos = 0
    this.dataLeft = 0 // when other side is going to send data

    socket.on('data', chunk => this.handleChunk(chunk))
    socket.on('end', () => { logger.info('conn ended') })
    socket.on('error', err => this.handleError(err))

    if (initiateHello) {
      socket.write('HELO\n')
      this.helos += 1
    }

    this.queue = []
  }

  processQueue () {
    this.queue.reduce((chain, prom) => {
      return chain.then(() => prom())
    }, Promise.resolve())
    this.queue = []
  }
    

  sync (id) {
    this.queue.push(() => new Promise((resolve) => {
      if (!this.alive) return
      logger.info(`Asking for ${id} feed data`)
      this.socket.write(`SYNC ${id}\n`, () => {
        resolve()
      })
    }))
  }

  end () {
    this.queue.push(() => new Promise((resolve) => {
      this.socket.end()
      this.alive = false
    }))
  }

  handleError (err) {
    logger.error(err)
    this.alive = false
  }

  handleChunk (chunk) {
    if (this.dataLeft > 0) {
      const data = chunk.slice(0, this.dataLeft)
      this.received = Buffer.concat([this.received, data])

      if (this.dataLeft - data.length === 0) { // got it all; process it
        this.handleDataPayload(this.received)
        this.received = chunk.slice(this.dataLeft + 1) // capture any extra stuff
      }

      this.dataLeft -= data.length

      return
    }

    const brk = chunk.indexOf('\n')
    if (brk >= 0) {
      this.handleData(Buffer.concat([this.received, chunk.slice(0, brk)]))
      this.received = chunk.slice(brk + 1)
    } else {
      this.received = Buffer.concat([this.received, chunk])
    }
  }

  handleDataPayload (payload) {
    cbor.decodeFirst(payload).then((decoded) => {
      const { id, log } = decoded
      const feed = local.feeds.get(id)
      if (!feed) {
        logger.warn('Received data that we do not care about')
        return
      }

      log.slice(feed.getLatestSeq()).forEach((newEntry) => {
        logger.info(`Adding entry to ${id}'s log`)
        feed.append(newEntry)
      })
    }).catch((err) => {
      logger.error(err)
    })
  }

  handleData (data) {
    // CMD [ARG1, ARG2...]
    // cmd is 4 chars
    const cmd = data.slice(0, 4).toString()
    if (this.helos === 0 && cmd !== 'HELO') {
      logger.warn('Client never said hello. Sad.')
      this.socket.end()
      return
    }

    switch (cmd) {
      case 'HELO': {
        if (this.helos === 1) {
          // got a return helo; process cmd queue
          this.processQueue()
          break
        }

        if (this.helos > 2) {
          logger.info('Too many hellos. Dropping')
          this.socket.end()
        }

        logger.info('Received helo')
        this.socket.write('HELO\n') // say helo back
        this.helos += 1
        break
      }
      case 'SYNC': {
        logger.info('Received sync request')
        // client wants whatever we have for <id>
        const id = data.slice(5).toString() // SYNC <id>
        if (!this.local.feeds.has(id)) {
          logger.info('Client wants something we do not have.')
          this.socket.end()
          break
        }

        const log = this.local.feeds.get(id).log.getData()
        const payload = cbor.encode({ id, log })
        const payloadLen = Buffer.alloc(4)
        payloadLen.writeIntBE(payload.length, 0, 4)

        const prelude = Buffer.concat([
          Buffer.from('DATA '),
          payloadLen,
          Buffer.from('\n')
        ])

        this.socket.write(prelude) // prepare client for payload
        this.socket.end(payload) // send it

        break
      }
      case 'DATA': {
        this.dataLeft = data.readIntBE(5, 4)
        logger.info(`Preparing to receive ${this.dataLeft} bytes of data`)
        break
      }
      default: {
        logger.info('Client sent bad input; dropping')
        // malformed input; break connection
        this.socket.end()
      }
    }
  }
}
