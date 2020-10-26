const got = require('got')
const { createRequestSignature } = require('./auth.js')

async function post (config, text) {
  const { keys, port } = config
  const body = { text }
  const { header } = createRequestSignature({ body, sk: Buffer.from(keys.sk, 'base64') })

  try {
    const { body: reply } = await got.post(`http://localhost:${port}/messages`, {
      json: body,
      headers: { 'ftsn-signature': header }
    })
    return reply
  } catch (e) {
    return e
  }
}

async function list (config) {
  const { keys, port } = config
  const { header } = createRequestSignature({ sk: Buffer.from(keys.sk, 'base64') })
  const { body } = await got(`http://localhost:${port}/messages`, {
    headers: { 'ftsn-signature': header }
  })
  return body
}

async function register (config, id, address) {
  const { keys, port } = config
  const payload = { id, address }
  const { header } = createRequestSignature({ body: payload, sk: Buffer.from(keys.sk, 'base64') })

  try {
    const { body } = await got.post(`http://localhost:${port}/register`, {
      json: payload,
      headers: { 'ftsn-signature': header }
    })
    return body
  } catch (e) {
    return e
  }
}

module.exports = (id) => {
  const config = require('./config.js')(id) // node client.js <id>
  return {
    id: () => config.keys.pk,
    post: post.bind(post, config),
    list: list.bind(list, config),
    register: register.bind(register, config),
  }
}

