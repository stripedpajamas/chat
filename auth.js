const { sign, verify } = require('./playground/entry')

// assumes pk is a buffer
function validateRequest (req, pk) {
  const { headers, body } = req
  const header = headers['ftsn-signature']

  if (!header) return false

  // ftsn-signature: t=<ts>,s=<sig>
  // signature is hex(sign(sk, timestamp + '.' + JSON.stringify([lexicographical props of body])))

  const [ts, sig] = header.split(',').map(kv => kv.split('=').pop())
  if (!ts || !sig) return false

  const signature = Buffer.from(sig, 'hex')

  const payload = payloadFromBody({ body, ts })
  return verify(Buffer.from(pk, 'base64'), signature, payload)
}

// assumes sk is a string
function createRequestSignature ({ body, sk, ts = Date.now() }) {
  const payload = payloadFromBody({ body, ts })
  console.error({ payload })

  const signature = sign(sk, payload).toString('hex')

  return {
    signature,
    header: `t=${ts},s=${signature}`
  }
}

function payloadFromBody ({ body = {}, ts = Date.now() }) {
  if (!body) body = {} // handle null bodies

  const props = Object.keys(body).sort()
  const vals = JSON.stringify(props.map(prop => body[prop]))

  const payload = `${ts}.${vals}`

  return payload
}


module.exports = {
  createRequestSignature,
  validateRequest
}
