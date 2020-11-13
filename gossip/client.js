const net = require('net')
const jsonStream = require('duplex-json-stream')
const logger = require('pino')()

function main (port) {
  const conn = jsonStream(net.connect(port, '127.0.0.1'))

  conn.on('data', (msg) => {
    console.error(JSON.stringify(msg, null, 2))
  })

  process.stdin.on('data', (chunk) => {
    const [str] = chunk.toString().split('\n')
    const [cmd, ...params] = str.split(' ')
    conn.write([1, Math.random(), cmd, params])
  })
  process.stdin.resume()
}

main(process.argv[2])
