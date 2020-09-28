const http = require('http')
const got = require('got')
const readline = require('readline')

// hosts includes other people and myself
const hosts = [
  { id: 'pete', url: 'http://localhost:6969' },
  { id: 'pete2', url: 'http://localhost:6970' },
]

const self = process.argv[2] === '6969' ? 'pete' : 'pete2'

// react to me sending others msgs
process.stdin.setEncoding('utf-8')
process.stdin.on('data', async (chunk) => {
  if (!chunk.length) { return }
  await Promise.all(hosts.map(async ({ url }) => {
    await got.post(url, {
      json: { id: self, msg: chunk }
    })
  }))
})
process.stdin.resume()

// listen for others sending me msgs
http.createServer((req, res) => {
  let data = []
  req.on('data', (chunk) => {
    data.push(chunk)
  })
  req.on('end', () => {
    let msg
    try {
      msg = JSON.parse(data)
      process.stdout.write(`${msg.id} > ${msg.msg}`)
    } catch (e) {}
  })
  res.end()
}).listen(process.argv[2], () => {
  console.error('Listening on port %d', process.argv[2])
})
 
