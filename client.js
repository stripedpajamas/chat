const got = require('got')
const { getOrCreateKeypair } = require('./playground/keypair.js')
const { createRequestSignature } = require('./auth.js')

const keypair = getOrCreateKeypair()

async function post (host, text) {
  const body = { text }
  const { header } = createRequestSignature({ body, sk: keypair.sk })

  try {
    const { body: reply } = await got.post(`http://${host}/messages`, {
      json: body,
      headers: {
        'ftsn-signature': header
      }
    })
    return reply
  } catch (e) {
    return e
  }
}

async function list (host) {
  const { body } = await got(`http://${host}/messages`)
  return body
}

module.exports = {
  post,
  list,
}

