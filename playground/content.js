const sodium = require('sodium-native')
const base32 = require('base32-encoding')

function sign (sk, contentString) {
  const contentBuf = Buffer.from(contentString, 'utf8')
  const sig = Buffer.alloc(sodium.crypto_sign_BYTES)

  sodium.crypto_sign_detached(sig, contentBuf, sk)

  return base32.stringify(sig)
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

  return base32.stringify(out)
}

function createEntry (sk, content) {
  const { channel, timestamp, text } = content
  const contentString = JSON.stringify([channel, timestamp, text])

  const hashStr = hash(contentString)
  const signature = sign(sk, contentString)

  return { content, signature, hash: hashStr }
}

function verifyEntry (pk, { content, signature: sigStr, hash: inputHash }) {
  const { channel, timestamp, text } = content
  const contentString = JSON.stringify([channel, timestamp, text])
  const signature = base32.parse(sigStr)

  if (!verify(pk, signature, contentString)) {
    return { valid: false, reason: 'invalid signature' }
  }
  if (hash(contentString) !== inputHash) {
    return { valid: false, reason: 'invalid hash' }
  }

  return { valid: true }
}

module.exports = {
  createEntry,
  verifyEntry,
}
