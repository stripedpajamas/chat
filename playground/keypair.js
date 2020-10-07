const sodium = require('sodium-native')

function generate () {
  const pk = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
  const sk = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)
  sodium.crypto_sign_keypair(pk, sk)

  return { pk, sk }
}

module.exports = {
  generate
}

