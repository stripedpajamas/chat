// rss style, kinda
// subscriber reaches out to all publishers for content
// publishers send back 

const net = require('net')
const logger = require('pino')()
const cbor = require('cbor')
const { Peer } = require('./peer')

const local = new Peer({ id: 'pete' })

const myFeed = local.feeds.get('pete')
myFeed.append('hello world')
myFeed.append('goodbye world')

const server = net.createServer()
const port = 6969 + parseInt(process.argv[2], 10)
server.listen(port, () => {
  logger.info(`Listening on ${port}`)
})

server.on('connection', (socket) => {
  const conn = new Connection({ socket, local })
})

class Connection {
  constructor ({ socket, local }) {
    this.local = local
    this.socket = socket
    this.received = Buffer.alloc(0)

    this.greeted = false
    this.dataLeft = 0 // when other side is going to send data

    socket.on('data', chunk => this.handleChunk(chunk))
  }

  handleChunk (chunk) {
    if (this.dataLeft > 0) {
      const data = chunk.slice(0, this.dataLeft)
      this.received = Buffer.concat([this.received, data])

      if (this.dataLeft - data.length === 0) { // got it all; process it
        this.handleData(this.received)
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

  handleData (data) {
    // CMD [ARG1, ARG2...]
    // cmd is 4 chars
    const cmd = data.slice(0, 4).toString()
    if (!this.greeted && cmd !== 'HELO') {
      logger.warn('Client never said hello. Sad.')
      this.socket.end()
      return
    }

    switch (cmd) {
      case 'HELO': {
        if (this.greeted) {
          logger.warn('Client said hello twice. Weird.')
          this.socket.end()
          break
        }

        logger.info('Received client helo')
        // send server helo
        this.socket.write('HELO\n')
        this.greeted = true
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
        const payload = cbor.encode(log)
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
