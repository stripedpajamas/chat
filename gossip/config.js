const { readFileSync } = require('fs')

module.exports = (id) => {
  return JSON.parse(readFileSync(`${id}.json`))
}

