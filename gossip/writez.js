const { Readable } = require('stream')

function alphabet () {
  let idx = 0
  let meta = 0
  const alpha = 'abcdefghijklmnopqrstuvwxyz'

  const stream = new Readable({
    read () {
      this.push(alpha[idx])
      idx = (idx + 1) % alpha.length
      if (idx === 0) meta++
      if (meta === 10) this.push(null)
    }
  })

  return stream
}

function numbers () {
  let idx = 0
  let meta = 0
  const nums = '0123456789'

  const stream = new Readable({
    read () {
      this.push(nums[idx])
      idx = (idx + 1) % nums.length
      if (idx === 0) meta++
      if (meta === 10) this.push(null)
    }
  })

  return stream
}

function main () {
  // the data will not be interleaved;
  // when the alphabet stream gives up, the numbers will begin
  alphabet().on('data', (ch) => {
    process.stdout.write(ch)
  })
  numbers().on('data', (ch) => {
    process.stdout.write(ch)
  })
}

main()
