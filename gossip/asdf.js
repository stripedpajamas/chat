const { Transform, pipeline } = require('stream')
const net = require('net')

// small function that expects 'HELO' and sends 'HI'
// and then goes to passthru mode
function handshaker (stream) {
  let state = {
    greeted: false,
    data: Buffer.alloc(0),
    receivedBytes: 0
  }

  const transform = new Transform({
    transform (chunk, enc, done) {
      if (state.greeted) {
        return done(null, chunk)
      }

      if (state.receivedBytes < 4) {
        const slice = chunk.slice(0, 4 - state.receivedBytes)
        state.data = Buffer.concat([state.data, slice])
        state.receivedBytes += slice.length
      }

      if (state.receivedBytes === 4) {
        if (state.data.toString() !== 'HELO') {
          return done('invalid handshake')
        }
        stream.write('HI')
        state.greeted = true
      }
    }
  })

  return transform
}

function parser () {

}

const server = net.createServer()
server.on('connection', (socket) => {
  const stream = pipeline(
    socket,
    handshaker(socket),
    (err) => { console.error(err) }
  )

  stream.on('data', (ch) => {
    process.stdout.write(ch)
  })
})

server.listen(6969)

