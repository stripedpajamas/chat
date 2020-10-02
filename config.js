function config (id) {
  return {
    port: 6969 + parseInt(id, 10),
    id
  }
}

module.exports = config
