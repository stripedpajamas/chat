const net = require('net')
const sodium = require('sodium-native')
const { Protocol } = require('./monster')
const { public } = require('./keys.json')

const keys = {
  public: Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES),
  secret: Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)
}
sodium.crypto_sign_keypair(keys.public, keys.secret)

const netId = Buffer.alloc(32)
netId.fill(7)

const socket = net.connect(6969, '127.0.0.1')
const protocol = Protocol(socket, true, {
  netId,
  keys,
  remote: {
    public: Buffer.from(public.data)
  }
})

protocol.messages.once('authenticated', async () => {
  try {
    const res = await protocol.requestSync('pete')
    console.error({ res })
  } catch (e) {
    console.error(e)
  }
})
