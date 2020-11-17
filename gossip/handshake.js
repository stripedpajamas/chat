const net = require('net')
const fs = require('fs')
const { Transform, pipeline } = require('stream')
const sodium = require('sodium-native')

// TESTING ONLY
const keys = {
  public: Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES),
  secret: Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)
}
sodium.crypto_sign_keypair(keys.public, keys.secret)
fs.writeFileSync('keys.json', JSON.stringify(keys))

const netId = Buffer.alloc(32)
netId.fill(7)

console.error(`Server public key: ${keys.public.toString('hex')}`)
////////////////

function serverHandshake (conn) {
  // step 0: receive 64 bytes of client hello
  //  -> send back 64 bytes of server hello
  // step 1: receive 112 bytes of client auth
  //  -> send back 80 bytes of server auth
  const STEP_SIZES = [64, 112]

  // ephemeral keys for this handshake
  const ephPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
  const ephSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES)
  sodium.crypto_box_keypair(ephPk, ephSk)

  const local = {
    public: keys.public,
    secret: keys.secret,
    ephPk,
    ephSk,
    sharedSecret0: null,
    sharedSecret0Hash: null,
    sharedSecret1: null,
    sharedSecret2: null
  }
  const remote = {
    ephPk: null,
    public: null
  }

  let authenticated = false

  let step = 0
  let receivedBytes = 0
  let data = Buffer.alloc(0)

  const stream = new Transform({})
  stream._transform = function (chunk, _, done) {
    // when handshake is complete, this transform becomes a passthru
    if (authenticated) {
      return done(null, chunk)
    }

    if (receivedBytes < STEP_SIZES[step]) {
      const slice = chunk.slice(0, STEP_SIZES[step] - receivedBytes)
      data = Buffer.concat([data, slice])
      receivedBytes += slice.length
    }

    // we now have enough to complete a step
    if (receivedBytes === STEP_SIZES[step]) {
      switch (step) {
        case 0: {
          const remoteAuthTag = data.slice(0, 32)
          remote.ephPk = data.slice(32)
          const valid = sodium.crypto_auth_verify(remoteAuthTag, remote.ephPk, netId)
          if (!valid) {
            conn.end()
          }

          // create a tag for our ephemeral public key, keyed by the network ID
          const authTag = Buffer.alloc(sodium.crypto_auth_BYTES)
          sodium.crypto_auth(authTag, local.ephPk, netId)

          // send our ephemeral public key with the auth tag
          conn.write(Buffer.concat([authTag, local.ephPk]))

          // make an curve25519 sk out of our long term ed25519 sk
          const longTermCurve = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES)
          sodium.crypto_sign_ed25519_sk_to_curve25519(longTermCurve, local.secret)

          // derive 2 shared secrets
          local.sharedSecret0 = Buffer.alloc(sodium.crypto_scalarmult_BYTES)
          sodium.crypto_scalarmult(local.sharedSecret0, local.ephSk, remote.ephPk)
          local.sharedSecret1 = Buffer.alloc(sodium.crypto_scalarmult_BYTES)
          sodium.crypto_scalarmult(local.sharedSecret1, longTermCurve, remote.ephPk)
          local.sharedSecret0Hash = Buffer.alloc(sodium.crypto_generichash_BYTES)
          sodium.crypto_generichash(local.sharedSecret0Hash, local.sharedSecret0)
          break
        }
        case 1: {
          const nonce = Buffer.alloc(24)
          nonce.fill(0)

          const plaintext = Buffer.alloc(data.length - sodium.crypto_secretbox_MACBYTES)
          const key = Buffer.alloc(sodium.crypto_generichash_BYTES)
          sodium.crypto_generichash(key, Buffer.concat([netId, local.sharedSecret0, local.sharedSecret1]))

          const decrypted = sodium.crypto_secretbox_open_easy(plaintext, data, nonce, key)
          if (!decrypted) {
            conn.end()
          }

          remote.sig = plaintext.slice(0, 64)
          remote.public = plaintext.slice(64)

          const expectedMsg = Buffer.concat([netId, local.public, local.sharedSecret0Hash])
          const valid = sodium.crypto_sign_verify_detached(remote.sig, expectedMsg, remote.public)
          if (!valid) {
            conn.end()
          }

          // compute the final shared secret
          const remoteLongTermPkCurve = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
          sodium.crypto_sign_ed25519_pk_to_curve25519(remoteLongTermPkCurve, remote.public)
          local.sharedSecret2 = Buffer.alloc(sodium.crypto_scalarmult_BYTES)
          sodium.crypto_scalarmult(local.sharedSecret2, local.ephSk, remoteLongTermPkCurve)


          // sign [netId || remoteSig || remotePk || hash(sharedSecret0)] with our long term secret
          const mySig = Buffer.alloc(sodium.crypto_sign_BYTES)
          sodium.crypto_sign_detached(
            mySig,
            Buffer.concat([netId, remote.sig, remote.public, local.sharedSecret0Hash]),
            local.secret
          )

          // send enc(sig, nonce: all zeroes, key: hash([netId || ss0 || ss1 || ss2]))
          const key2 = Buffer.alloc(sodium.crypto_generichash_BYTES)
          sodium.crypto_generichash(key2, Buffer.concat([
            netId,
            local.sharedSecret0,
            local.sharedSecret1,
            local.sharedSecret2
          ]))

          const payload = Buffer.alloc(mySig.length + sodium.crypto_secretbox_MACBYTES)
          sodium.crypto_secretbox_easy(payload, mySig, nonce, key2)

          conn.write(payload)

          authenticated = true
          conn.emit('authenticated', { local, remote })
          break
        }
      }
      // in any case, we should increment step at this point and reset state
      step += 1
      receivedBytes = 0
      data = Buffer.alloc(0)
    }

    done()
  }

  return stream
}



const server = net.createServer()

server.on('connection', (conn) => {
  console.error('new connection')
  pipeline(
    conn,
    serverHandshake(conn),
    process.stdout,
    (err) => {
      if (err) { console.error('FAIL', err) }
      else { console.error('SUCCESS/DONE') }
    }
  )
})

server.listen(6969)
