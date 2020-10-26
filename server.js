const Fastify = require('fastify')
const got = require('got')
const { validateRequest, createRequestSignature } = require('./auth.js')
const Node = require('./playground/node.js')
const config = require('./config.js')(process.argv[2]) // node server.js <id>

const fastify = Fastify({ logger: true })
fastify.decorate('node', new Node({ logger: fastify.log, keys: config.keys }))
fastify.decorate('nodes', new Set())

function privateRouteGuard (req, reply, done) {
  if (!validateRequest(req, this.node.keys.pk)) {
    return reply.code(401).send({ ok: 0 })
  }
  done()
}

/* Private routes (local client only) */
fastify.get('/messages', {
  preHandler: privateRouteGuard,
  handler: function (req, reply) {
    reply.send({ messages: this.node.getMessages() })
  }
})

fastify.post('/messages', {
  preHandler: privateRouteGuard,
  handler: function (req, reply) {
    const { text, channel } = req.body
    this.node.addMsg({ text, channel })
    reply.send({ ok: 1 })
  }
})

fastify.post('/register', {
  preHandler: privateRouteGuard,
  handler: function (req, reply) {
    const { id, address } = req.body
    this.node.addLogId(id)
    this.nodes.add(address)
    reply.send({ ok: 1})
  }
})
////////////////////////////////////////

/* Public routes (authorized peers call them) */
fastify.post('/sync', {
  preHandler: function (req, reply, done) {
    const { body } = req
    const { from: pk } = body
    if (!this.node.db.hasLogId(pk) || !validateRequest(req, pk)) {
      return reply.code(401).send({ ok: 0 })
    }
    done()
  },
  handler: function (req, reply) {
    const { syncData } = req.body
    this.node.db.mergeSyncData(syncData)
    reply.send({ ok: 1 })
  }
})
///////////////////////////////////////

setInterval(() => {
  const syncData = fastify.node.db.getSyncData()
  const payload = {
    syncData,
    from: fastify.node.keys.pk
  }
  const { header } = createRequestSignature({
    body: payload,
    sk: Buffer.from(fastify.node.keys.sk, 'base64')
  })

  for (const node of fastify.nodes) {
    got.post(`${node}/sync`, {
      json: payload,
      headers: { 'ftsn-signature': header }
    }).catch((e) => fastify.log.warn(e)) // not a big deal if sync fails (sibling node down)
  }
}, 5000)

fastify.listen(config.port)

