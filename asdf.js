async function thrower () {
  throw new Error('asdf')
}

// this version will throw unhandled rejection
// async function main () {
//   for (let i = 0; i < 3; i++) {
//     try {
//       thrower()
//     } catch (e) {
//       console.error(e)
//     }
//   }
// }

// this version will be fine
async function main () {
  for (let i = 0; i < 3; i++) {
    thrower().catch((e) => console.error(e))
  }
}

main()

