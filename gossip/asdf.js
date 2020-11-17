const { Transform, pipeline } = require('stream')
const net = require('net')

// small transform that expects 'HELO\n' and sends 'HI\n'
// and then goes to passthru mode
function handshaker (stream, globalState) {
  let state = {
    greeted: false,
    data: Buffer.alloc(0),
    receivedBytes: 0,
    consumedFromChunk: 0
  }

  const transform = new Transform({
    transform (chunk, enc, done) {
      if (state.greeted) {
        return done(null, chunk)
      }

      if (state.receivedBytes < 5) {
        const slice = chunk.slice(0, 5 - state.receivedBytes)
        state.data = Buffer.concat([state.data, slice])
        state.receivedBytes += slice.length
        state.consumedFromChunk = slice.length
      }

      if (state.receivedBytes === 5) {
        if (state.data.toString() !== 'HELO\n') {
          return done('invalid handshake')
        }
        stream.write('HI\n')
        state.greeted = true
        globalState.key = 3
      
        // send whatever is leftover after handshake
        done(null, chunk.slice(state.consumedFromChunk))
      }
    }
  })

  return transform
}

// small transform that needs something that results from the handshaker
// e.g. encryption/decryption keys
// for playing around, it reads a 1 byte header which says how many bytes the
// the upcoming message is; then it reads that many bytes of the message
// and uppercases N bytes of it (N being a "key" received from the handshaker),
// before sending it along
function encryption (stream, globalState) {
  let state = {
    data: Buffer.alloc(0),
    headerRead: false,
    receivedBytes: 0,
    expectedDataSize: 0,
  }

  const transform = new Transform({})
  transform._transform = function (chunk, enc, done) {
    if (!globalState.key) {
      done('no keys')
    }

    let chIdx = 0
    while (chIdx < chunk.length) {
      if (!state.headerRead) {
        state.expectedDataSize = chunk[chIdx] // just the size of expected data
        state.headerRead = true
        chIdx++

        console.error(`expecting ${state.expectedDataSize}`)
      }

      const { headerRead, receivedBytes, expectedDataSize } = state
      if (headerRead && receivedBytes < expectedDataSize) {
        const slice = chunk.slice(chIdx, chIdx + expectedDataSize - receivedBytes)
        state.data = Buffer.concat([state.data, slice])
        state.receivedBytes += slice.length
        chIdx += slice.length
      }

      if (state.receivedBytes === state.expectedDataSize) {
        // "decrypt" it
        for (let i = 0; i < globalState.key; i++) {
          state.data[i] = state.data[i].toString().toUpperCase()
        }

        // let it through, and reset state
        this.push(state.data)
        state.headerRead = false
        state.data = Buffer.alloc(0)
        state.receivedBytes = 0
        state.expectedDataSize = 0
      }
    }

    // when we've consumed the chunk, we say we're done
    done()
  }

  return transform
}

const server = net.createServer()
server.on('connection', (socket) => {
  const state = {}
  const stream = pipeline(
    socket,
    handshaker(socket, state),
    encryption(socket, state),
    (err) => { console.error(err) }
  )

  stream.on('data', (ch) => {
    process.stdout.write(ch)
  })
})

server.listen(6969)

