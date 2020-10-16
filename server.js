const Fastify = require('fastify')
const got = require('got')
const { validateRequest } = require('./auth.js')
const Node = require('./playground/node.js')
const config = require('./config.js')(process.argv[2]) // node server.js <id>

const fastify = Fastify({ logger: true })
fastify.decorate('node', new Node({ logger: fastify.log }))
fastify.decorate('nodes', new Set())

fastify.get('/messages', {
  preHandler: function (req, reply, done) {
    if (!validateRequest(req, this.node.keys.sk)) {
      return reply.code(401).send({ ok: 0 })
    }
    done()
  },
  handler: function (req, reply) {
    reply.send({ messages: this.node.getMessages() })
  }
})

fastify.post('/messages', {
  preHandler: function (req, reply, done) {
    if (!validateRequest(req, this.node.keys.sk)) {
      return reply.code(401).send({ ok: 0 })
    }
    done()
  },
  handler: function (req, reply) {
    const { text, channel } = req.body
    this.node.addMsg({ text, channel })
    reply.send({ ok: 1 })
  }
})

fastify.post('/sync', function (req, reply) {
  const { syncData } = req.body
  this.node.db.mergeSyncData(syncData)
  reply.send({ ok: 1 })
})

fastify.post('/register', function (req, reply) {
  const { id, address } = req.body
  this.node.addLogId(id)
  this.nodes.add(address)
  reply.send({ ok: 1})
})

setInterval(() => {
  const syncData = fastify.node.db.getSyncData()
  for (const node of fastify.nodes) {
    got.post(`${node}/sync`, { json: { syncData } })
      .catch((e) => fastify.log.warn(e)) // not a big deal if sync fails (sibling node down)
  }
}, 5000)

fastify.listen(config.port)

