module.exports = (id) => ({
  id: id == 0 ? 'pete' : 'luna',
  otherId: id == 0 ? 'luna' : 'pete',
  port: 6969 + parseInt(id, 10),
  peers: id == 0 ? [{ address: '127.0.0.1', port: 6970 }] : [{ address: '127.0.0.1', port: 6969 }]
})
