const net = require('net')
const fs = require('fs')
const sodium = require('sodium-native')
const { Protocol } = require('./monster')

const keys = {
  public: Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES),
  secret: Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)
}
sodium.crypto_sign_keypair(keys.public, keys.secret)
fs.writeFileSync('keys.json', JSON.stringify(keys))

const netId = Buffer.alloc(32)
netId.fill(7)

const server = net.createServer()

server.on('connection', (socket) => {
  console.error('new connection')
  const protocol = Protocol(socket, false, {
    keys,
    netId,
  })
  socket.pipe(process.stdout)
})

server.listen(6969)


