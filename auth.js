const crypto = require('crypto')

// assumes sk is a string
function validateRequest (req, sk) {
  const { headers, body } = req
  const header = headers['ftsn-signature']

  if (!header) return false

  // ftsn-signature: t=<ts>,s=<sig>
  // signature is hex(HMAC(sk, timestamp + '.' + JSON.stringify([lexicographical props of body])))

  const [ts, sig] = header.split(',').map(kv => kv.split('=').pop())
  if (!ts || !sig) return false

  const actual = Buffer.from(sig, 'hex')
  const { signature: expected } = createRequestSignature({ body, sk, ts })
  if (expected.length !== actual.length) return false

  return crypto.timingSafeEqual(expected, actual)
}

// assumes sk is a string
function createRequestSignature ({ body, sk, ts = Date.now() }) {
  const props = Object.keys(body).sort()
  const vals = JSON.stringify(props.map(prop => body[prop]))

  const payload = `${ts}.${vals}`

  const hmac = crypto.createHmac('sha256', Buffer.from(sk, 'base64')).update(payload).digest()
  const hex = hmac.toString('hex')

  return {
    hex,
    signature: hmac,
    header: `t=${ts},s=${hex}`
  }
}

module.exports = {
  createRequestSignature,
  validateRequest
}
