const Fastify = require('fastify')
const net = require('net')

const fastify = Fastify({ logger: true })
const messages = []
const clients = []
const dateTimeOpts = {
  month: 'numeric',
  year: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hour12: false
}

// schemas
fastify.addSchema({
  $id: 'chaz',
  type: 'object',
  properties: {
    message: {
      type: 'object',
      properties: {
        fromId: { type: 'string' },
        timestamp: { type: 'number' },
        text: { type: 'string' }
      }
    }
  }
})

// routes
fastify.get('/messages', (req, reply) => {
  reply.send(messages)
})
fastify.post('/messages', {
  schema: {
    body: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { $ref: 'chaz#/properties/message' }
      }
    }
  },
  handler (req, reply) {
    messages.push(req.body.message)
    clients.forEach(({ socket }) => writeToClient(socket, req.body.message))
    reply.send({ ok: 1 })
  },
})
fastify.listen(process.argv[2], '0.0.0.0')

// run client facing socket
const server = net.createServer((socket) => {
  console.error('New socket connection')
  // send history
  messages.forEach((msg) => writeToClient(socket, msg))

  // prepare for other messages
  const id = Math.random().toString(36).slice(2)
  clients.push({ id, socket })

  socket.on('end', () => {
    clients.splice(clients.findIndex(({ id: existingId }) => existingId === id), 1)
    console.error('Client %s disconnected', id)
  })
}).listen(6970, () => {
  console.error('Socket server listening on 6970')
})

function writeToClient (socket, msg) {
  const { fromId, timestamp, text } = msg
  const time = new Intl.DateTimeFormat('default', dateTimeOpts).format(new Date(timestamp))
  socket.write(`(${time}) ${fromId} > ${text}\n`)
}
