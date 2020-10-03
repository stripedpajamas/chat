const Fastify = require('fastify')
const got = require('got')
const MsgStore = require('./msgstore')
const config = require('./config')(process.argv[2])

const fastify = Fastify({ logger: true })
fastify.decorate('state', new MsgStore())
fastify.decorate('nodes', new Set())

// get the current value
fastify.get('/msglist', function (req, reply) {
  const msgList = this.state.allMsgs()
  reply.send({ msglist: [...msgList.values()] })
})

// add a msg
fastify.post('/add', function (req, reply) {
  const { msg } = req.body
  const timestamp = Date.now()
  this.state.add({ timestamp, ...msg })
  reply.send({ ok: 1 })
})

// sync state with another node
fastify.post('/sync', function (req, reply) {
  const { deltas } = req.body
  this.state.mergeSerializedDeltas(deltas)
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
  if (fastify.state.getDeltas().size) {
    const deltas = fastify.state.getSerializedDeltas()
    for (const node of fastify.nodes) {
      got.post(`${node}/sync`, { json: { deltas } })
        .then(() => fastify.state.clearDeltas())
        .catch((e) => fastify.log.error(e))
    }
  }
}, 5000)

fastify.listen(config.port)

