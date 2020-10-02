const Fastify = require('fastify')
const got = require('got')
const Counter = require('./counter')
const config = require('./config')(process.argv[2])

const fastify = Fastify({ logger: true })
fastify.decorate('state', new Counter(config.id))
fastify.decorate('nodes', new Set())

// get the current value
fastify.get('/value', function (req, reply) {
  reply.send({ value: this.state.value() })
})

// increment the value
fastify.post('/inc', function (req, reply) {
  this.state.inc()
  reply.send({ ok: 1 })
})

// sync the value with another node
fastify.post('/sync', function (req, reply) {
  const { state } = req.body
  this.state.merge(state)
  reply.send({ ok: 1 })
})

// register another node so this node can sync with it
fastify.post('/register', function (req, reply) {
  const { address } = req.body
  this.nodes.add(address)
  reply.send({ ok: 1})
})

// every 5s, sync with known nodes
setInterval(() => {
  for (const node of fastify.nodes) {
    got.post(`${node}/sync`, {
      json: { state: fastify.state.getState() }
    }).catch((e) => fastify.log.error(e))
  }
}, 5000)

fastify.listen(config.port)

