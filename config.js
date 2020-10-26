const { getOrCreateKeypair } = require('./playground/keypair')

function config (id) {
  return {
    port: 6969 + parseInt(id, 10),
    keys: getOrCreateKeypair(id),
    id
  }
}

module.exports = config
