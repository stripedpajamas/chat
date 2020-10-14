const sodium = require('sodium-native')

module.exports = {
  generate
}

function generate () {
  const pk = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
  const sk = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)
  sodium.crypto_sign_keypair(pk, sk)

  return {
    pk: pk.toString('base64'),
    sk: sk.toString('base64')
  }
}

