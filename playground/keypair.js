const Conf = require('conf')
const sodium = require('sodium-native')

module.exports = {
  generate,
  getOrCreateKeypair
}

// look on filesystem for keypair;
// if not found, generate and save
function getOrCreateKeypair (app = 'main') {
  const conf = new Conf({
    projectName: 'ftsn',
    configName: app
  })

  if (conf.has('keypair')) {
    return conf.get('keypair')
  }

  const keypair = generate()
  conf.set('keypair', keypair)

  return keypair
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

