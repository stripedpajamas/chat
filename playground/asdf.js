const keypair = require('./keypair')
const contentUtil = require('./content')

const keys = keypair.generate()

const content = {
  timestamp: Date.now(),
  channel: null,
  text: 'hello world'
}

console.error({ content })

const entry = contentUtil.createEntry(keys.sk, content)

console.error({ entry })

const { valid, reason } = contentUtil.verifyEntry(keys.pk, entry)

console.error({ valid })

