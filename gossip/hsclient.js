const net = require('net')
const { Transform, pipeline } = require('stream')
const sodium = require('sodium-native')

// TESTING (CLIENT LONG TERM KEYS)
const keys = {
  public: Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES),
  secret: Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)
}
sodium.crypto_sign_keypair(keys.public, keys.secret)

const netId = Buffer.alloc(32)
netId.fill(7)

function clientHandshake (conn, remotePk) {
  //  -> send 64 bytes of client hello
  // step 0: receive 64 bytes of remote hello
  //  -> send 112 bytes of client auth
  // step 1: receive 80 bytes of remote auth
  const STEP_SIZES = [64, 80]

  // ephemeral keys for this handshake
  const ephPk = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
  const ephSk = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES)
  sodium.crypto_box_keypair(ephPk, ephSk)

  // create a tag for our ephemeral public key, keyed by the network ID
  const authTag = Buffer.alloc(sodium.crypto_auth_BYTES)
  sodium.crypto_auth(authTag, ephPk, netId)

  // send our ephemeral public key with the auth tag
  conn.write(Buffer.concat([authTag, ephPk]))

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
    public: remotePk,
    ephPk: null
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

          // make an curve25519 pk out of the remote's long term ed25519 pk
          const remoteLongTermPkCurve = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
          sodium.crypto_sign_ed25519_pk_to_curve25519(remoteLongTermPkCurve, remote.public)

          // derive 2 shared secrets
          local.sharedSecret0 = Buffer.alloc(sodium.crypto_scalarmult_BYTES)
          sodium.crypto_scalarmult(local.sharedSecret0, ephSk, remote.ephPk)
          local.sharedSecret1 = Buffer.alloc(sodium.crypto_scalarmult_BYTES)
          sodium.crypto_scalarmult(local.sharedSecret1, ephSk, remoteLongTermPkCurve)
          local.sharedSecret0Hash = Buffer.alloc(sodium.crypto_generichash_BYTES)
          sodium.crypto_generichash(local.sharedSecret0Hash, local.sharedSecret0)

          // compute the final shared secret
          const longTermCurve = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES)
          sodium.crypto_sign_ed25519_sk_to_curve25519(longTermCurve, local.secret)
          local.sharedSecret2 = Buffer.alloc(sodium.crypto_scalarmult_BYTES)
          sodium.crypto_scalarmult(local.sharedSecret2, longTermCurve, remote.ephPk)

          console.error('final shared secret:', local.sharedSecret2.toString('hex'))

          // sign [netId || remotePk || hash(sharedSecret0)] with our long term secret
          local.sig = Buffer.alloc(sodium.crypto_sign_BYTES)
          sodium.crypto_sign_detached(
            local.sig,
            Buffer.concat([netId, remote.public, local.sharedSecret0Hash]),
            local.secret
          )

          // send enc([sig || longterm pk], nonce: all zeroes, key: hash([netId || ss0 || ss1]))
          const msg = Buffer.concat([local.sig, local.public])
          const key = Buffer.alloc(sodium.crypto_generichash_BYTES)
          sodium.crypto_generichash(key, Buffer.concat([netId, local.sharedSecret0, local.sharedSecret1]))
          const nonce = Buffer.alloc(24)
          nonce.fill(0)

          const payload = Buffer.alloc(msg.length + sodium.crypto_secretbox_MACBYTES)
          sodium.crypto_secretbox_easy(payload, msg, nonce, key)

          conn.write(payload)
          break
        }
        case 1: {
          const nonce = Buffer.alloc(24)
          nonce.fill(0)

          const plaintext = Buffer.alloc(data.length - sodium.crypto_secretbox_MACBYTES)
          const key = Buffer.alloc(sodium.crypto_generichash_BYTES)
          sodium.crypto_generichash(key, Buffer.concat([
            netId,
            local.sharedSecret0,
            local.sharedSecret1,
            local.sharedSecret2
          ]))

          const decrypted = sodium.crypto_secretbox_open_easy(plaintext, data, nonce, key)
          if (!decrypted) {
            conn.end()
          }

          remote.sig = plaintext

          const expectedMsg = Buffer.concat([netId, local.sig, local.public, local.sharedSecret0Hash])
          const valid = sodium.crypto_sign_verify_detached(remote.sig, expectedMsg, remote.public)
          if (!valid) {
            conn.end()
          }

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

function main (address, port, remotePk) {
  const conn = net.connect(port, address)

  pipeline(
    conn,
    clientHandshake(conn, remotePk),
    process.stdout,
    (err) => {
      if (err) { console.error('FAIL', err) }
      else { console.error('SUCCESS/DONE') }
    }
  )

  conn.on('authenticated', ({ local, remote }) => {
    conn.write('hello world hello world')
  })
}

const { public } = require('./keys.json')
main('127.0.0.1', 6969, Buffer.from(public.data))

