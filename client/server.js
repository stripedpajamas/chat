const path = require('path')
const fastify = require('fastify')({ logger: true })
const got = require('got')
const { createRequestSignature } = require('../auth.js')
const { getOrCreateKeypair } = require('../playground/keypair.js')

const keys = getOrCreateKeypair(process.argv[2])
const localId = parseInt(process.argv[2], 10)
const localNodePort = 6969 + localId
const clientPort = 7000 + localId
const localNode = `http://localhost:${localNodePort}`

// purpose of this server is to serve the static website
// and to send authenticated requests to the node BE

// serve website
fastify.register(require('fastify-static'), {
  root: path.join(__dirname, 'public')
})

// get message list
fastify.get('/messages', function (req, reply) {
  const { header } = createRequestSignature({ sk: Buffer.from(keys.sk, 'base64') })
  got.get(`${localNode}/messages`, {
    responseType: 'json',
    headers: { 'ftsn-signature': header }
  }).then(({ body }) => {
    reply.send(body)
  }).catch((e) => {
    this.log.error(e)
    reply.status(500).send({ ok: 0 })
  })
})

// send a message
fastify.post('/messages', function (req, reply) {
  const { text = null, channel = null} = req.body
  const payload = { text, channel }

  const { header } = createRequestSignature({ body: payload, sk: Buffer.from(keys.sk, 'base64') })

  got.post(`${localNode}/messages`, {
    json: payload,
    responseType: 'json',
    headers: { 'ftsn-signature': header }
  }).then(({ body }) => {
    reply.send(body)
  }).catch((e) => {
    this.log.error(e)
    reply.status(500).send({ ok: 0 })
  })
})

// register a friend
fastify.post('/register', (req, reply) => {})
////////////////////////////////////////

fastify.listen(clientPort)

