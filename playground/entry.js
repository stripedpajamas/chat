const sodium = require('sodium-native')

module.exports = {
  createEntry,
  verifyEntry,
}

function sign (sk, contentString) {
  const contentBuf = Buffer.from(contentString, 'utf8')
  const sig = Buffer.alloc(sodium.crypto_sign_BYTES)

  sodium.crypto_sign_detached(sig, contentBuf, sk)

  return sig.toString('base64')
}

function verify (pk, signature, contentString) {
  const contentBuf = Buffer.from(contentString, 'utf8')
  const valid = sodium.crypto_sign_verify_detached(signature, contentBuf, pk)

  return valid
}

function hash (contentString) {
  const contentBuf = Buffer.from(contentString, 'utf8')
  const out = Buffer.alloc(sodium.crypto_generichash_BYTES_MAX)

  sodium.crypto_generichash(out, contentBuf)

  return out.toString('base64')
}

// expecting non-binary inputs
function createEntry (sk, content) {
  const { channel, timestamp, text } = content
  const contentString = JSON.stringify([channel, timestamp, text])
  const secretKey = Buffer.from(sk, 'base64')

  const hashStr = hash(contentString)
  const signature = sign(secretKey, contentString)

  return { content, signature, hash: hashStr }
}

// expecting non-binary inputs
function verifyEntry (pk, { content, signature: sigStr, hash: inputHash }) {
  const { channel, timestamp, text } = content
  const contentString = JSON.stringify([channel, timestamp, text])
  const signature = Buffer.from(sigStr, 'base64')
  const publicKey = Buffer.from(pk, 'base64')

  if (!verify(publicKey, signature, contentString)) {
    return { valid: false, reason: 'invalid signature' }
  }
  if (hash(contentString) !== inputHash) {
    return { valid: false, reason: 'invalid hash' }
  }

  return { valid: true }
}

