const Node = require('./node')

// testing
const a = new Node({})
const b = new Node({})

a.addLogId(b.id())
b.addLogId(a.id())

a.addMsg({ text: 'hello world from a!' })
b.addMsg({ text: 'hello world from b!' })
a.addMsg({ text: 'happy birthday!' })

a.db.mergeSyncData(b.db.getSyncData())
b.db.mergeSyncData(a.db.getSyncData())

console.error('a:', a.getMessages()) // all 3 msgs
console.error('b:', b.getMessages()) // all 3 msgs
