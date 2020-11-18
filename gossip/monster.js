const sodium = require('sodium-native')

// socket is duplex stream; init is whether or not we initiated the connection
function Protocol (socket, init, opts) {
  // a place to buffer incoming data (since it comes in chunks)
  let buf = Buffer.alloc(0)

  const handshakeState = {
    done: false,

    // <- receive 64 bytes of client hello
    // -> send back 64 bytes of server hello
    // <- receive 112 bytes of client auth
    // -> send back 80 bytes of server auth
    stepSizes: init ? [64, 80] : [64, 112],
    step: 0,
    receivedBytes: 0,
    zeroNonce: Buffer.alloc(24),
    netId: opts.netId,
    local: {
      public: opts.keys.public,
      secret: opts.keys.secret,
      ephPk: Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES),
      ephSk: Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES),
      sharedSecret0: Buffer.alloc(sodium.crypto_scalarmult_BYTES),
      sharedSecret0Hash: Buffer.alloc(sodium.crypto_generichash_BYTES),
      sharedSecret1: Buffer.alloc(sodium.crypto_scalarmult_BYTES),
      sharedSecret2: Buffer.alloc(sodium.crypto_scalarmult_BYTES)
    },
    remote: {
      public: null,
      ephPk: null,
      sig: null
    }
  }
  const authState = {}

  // init ephemeral keys for this session
  sodium.crypto_box_keypair(ephPk, ephSk)
  handshakeState.zeroNonce.fill(0)

  // handle a chunk of bytes recieved on the socket
  socket.on('data', function handleRawChunk (chunk, enc, done) {
    // both functions return any data that wasn't used
    // since at the end of, e.g. a handshake, there might
    // be authenticated data in the same chunk (maybe... not sure actually)
    if (handshakeState.done) {
      buf = handleAuthenticatedChunk(chunk, enc, done)
    } else {
      buf = handleHandshakeChunk(chunk, enc, done)
    }

    done()
  })

  function handleHandshakeChunk (chunk, enc, done) {
    const { stepSizes, step } = handshakeState

    let unused = Buffer.alloc(0)
    if (handshakeState.receivedBytes < stepSizes[step]) {
      const slice = chunk.slice(0, stepSizes[step] - handshakeState.receivedBytes)
      buf = Buffer.concat([buf, slice])
      if (chunk.length > slice.length) {
        unused = chunk.slice(slice.length)
      }
      handshakeState.receivedBytes += slice.length
    }

    // we now have enough to complete a step
    if (receivedBytes === stepSizes[step]) {
      if (init) handleClientHandshakeStep()
      else handleServerHandshakeStep()

      // in any case, we should increment step at this point and reset state
      handshakeState.step += 1
      handshakeState.receivedBytes = 0
      buf = Buffer.alloc(0)
    }

    return unused
  }

  function handleClientHandshakeStep () {
    const { step } = handshakeState
    switch (step) {
      case 0: {
        const remoteAuthTag = buf.slice(0, 32)
        handshakeState.remote.ephPk = buf.slice(32)
        const valid = sodium.crypto_auth_verify(remoteAuthTag, handshakeState.remote.ephPk, netId)
        if (!valid) {
          socket.end()
        }

        // make an curve25519 pk out of the remote's long term ed25519 pk
        const remoteLongTermPkCurve = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
        sodium.crypto_sign_ed25519_pk_to_curve25519(remoteLongTermPkCurve, handshakeState.remote.public)

        // derive 2 shared secrets and hash the first
        sodium.crypto_scalarmult(handshakeState.local.sharedSecret0, handshakeState.ephSk, handshakeState.remote.ephPk)
        sodium.crypto_scalarmult(handshakeState.local.sharedSecret1, handshakeState.local.ephSk, remoteLongTermPkCurve)
        sodium.crypto_generichash(handshakeState.local.sharedSecret0Hash, handshakeState.local.sharedSecret0)

        // compute the final shared secret
        const longTermCurve = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES)
        sodium.crypto_sign_ed25519_sk_to_curve25519(longTermCurve, handshakeState.local.secret)
        sodium.crypto_scalarmult(handshakeState.local.sharedSecret2, longTermCurve, handshakeState.remote.ephPk)

        // sign [netId || remotePk || hash(sharedSecret0)] with our long term secret
        handshakeState.local.sig = Buffer.alloc(sodium.crypto_sign_BYTES)
        sodium.crypto_sign_detached(
          handshakeState.local.sig,
          Buffer.concat([handshakeState.netId, handshakeState.remote.public, handshakeState.local.sharedSecret0Hash]),
          handshakeState.local.secret
        )

        // send enc([sig || longterm pk], nonce: all zeroes, key: hash([netId || ss0 || ss1]))
        const msg = Buffer.concat([handshakeState.local.sig, handshakeState.local.public])
        const key = Buffer.alloc(sodium.crypto_generichash_BYTES)
        sodium.crypto_generichash(key, Buffer.concat([handshakeState.netId, handshakeState.local.sharedSecret0, handshakeState.local.sharedSecret1]))

        const payload = Buffer.alloc(msg.length + sodium.crypto_secretbox_MACBYTES)
        sodium.crypto_secretbox_easy(payload, msg, handshakeState.zeroNonce, key)

        socket.write(payload)
        break
      }
      case 1: {
        const plaintext = Buffer.alloc(buf.length - sodium.crypto_secretbox_MACBYTES)
        const key = Buffer.alloc(sodium.crypto_generichash_BYTES)
        sodium.crypto_generichash(key, Buffer.concat([
          handshakeState.netId,
          handshakeState.local.sharedSecret0,
          handshakeState.local.sharedSecret1,
          handshakeState.local.sharedSecret2
        ]))

        const decrypted = sodium.crypto_secretbox_open_easy(plaintext, buf, handshakeState.zeroNonce, key)
        if (!decrypted) {
          socket.end()
        }

        handshakeState.remote.sig = plaintext

        const expectedMsg = Buffer.concat([
          handshakeState.netId,
          handshakeState.local.sig,
          handshakeState.local.public,
          handshakeState.local.sharedSecret0Hash
        ])
        const valid = sodium.crypto_sign_verify_detached(handshakeState.remote.sig, expectedMsg, handshakeState.remote.public)
        if (!valid) {
          socket.end()
        }

        handshakeState.done = true
        break
      }
    }
  }

  function handleServerHandshakeStep () {
    const { step } = handshakeState
    switch (step) {
      case 0: {
        const remoteAuthTag = buf.slice(0, 32)
        handshakeState.remote.ephPk = buf.slice(32)
        const valid = sodium.crypto_auth_verify(remoteAuthTag, handshakeState.remote.ephPk, handshakeState.netId)
        if (!valid) {
          socket.end()
        }

        // create a tag for our ephemeral public key, keyed by the network ID
        const authTag = Buffer.alloc(sodium.crypto_auth_BYTES)
        sodium.crypto_auth(authTag, handshakeState.local.ephPk, handshakeState.netId)

        // send our ephemeral public key with the auth tag
        socket.write(Buffer.concat([authTag, handshakeState.local.ephPk]))

        // make an curve25519 sk out of our long term ed25519 sk
        const longTermCurve = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES)
        sodium.crypto_sign_ed25519_sk_to_curve25519(longTermCurve, handshakeState.local.secret)

        // derive 2 shared secrets, and hash the first
        sodium.crypto_scalarmult(handshakeState.local.sharedSecret0, handshakeState.local.ephSk, handshakeState.remote.ephPk)
        sodium.crypto_scalarmult(handshakeState.local.sharedSecret1, longTermCurve, handshakeState.remote.ephPk)
        sodium.crypto_generichash(handshakeState.local.sharedSecret0Hash, handshakeState.local.sharedSecret0)
        break
      }
      case 1: {
        const plaintext = Buffer.alloc(buf.length - sodium.crypto_secretbox_MACBYTES)
        const key = Buffer.alloc(sodium.crypto_generichash_BYTES)
        sodium.crypto_generichash(key, Buffer.concat([
          handshakeState.netId,
          handshakeState.local.sharedSecret0,
          handshakeState.local.sharedSecret1
        ]))

        const decrypted = sodium.crypto_secretbox_open_easy(plaintext, buf, handshakeState.zeroNonce, key)
        if (!decrypted) {
          socket.end()
        }

        handshakeState.remote.sig = plaintext.slice(0, 64)
        handshakeState.remote.public = plaintext.slice(64)

        const expectedMsg = Buffer.concat([
          handshakeState.netId,
          handshakeState.local.public,
          handshakeState.local.sharedSecret0Hash
        ])
        const valid = sodium.crypto_sign_verify_detached(handshakeState.remote.sig, expectedMsg, handshakeState.remote.public)
        if (!valid) {
          socket.end()
        }

        // compute the final shared secret
        const remoteLongTermPkCurve = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
        sodium.crypto_sign_ed25519_pk_to_curve25519(remoteLongTermPkCurve, handshakeState.remote.public)
        sodium.crypto_scalarmult(handshakeState.local.sharedSecret2, handshakeState.local.ephSk, remoteLongTermPkCurve)


        // sign [netId || remoteSig || remotePk || hash(sharedSecret0)] with our long term secret
        const mySig = Buffer.alloc(sodium.crypto_sign_BYTES)
        sodium.crypto_sign_detached(
          mySig,
          Buffer.concat([
            handshakeState.netId,
            handshakeState.remote.sig,
            handshakeState.remote.public,
            handshakeState.local.sharedSecret0Hash
          ]),
          handshakeState.local.secret
        )

        // send enc(sig, nonce: all zeroes, key: hash([netId || ss0 || ss1 || ss2]))
        const key2 = Buffer.alloc(sodium.crypto_generichash_BYTES)
        sodium.crypto_generichash(key2, Buffer.concat([
          handshakeState.netId,
          handshakeState.local.sharedSecret0,
          handshakeState.local.sharedSecret1,
          handshakeState.local.sharedSecret2
        ]))

        const payload = Buffer.alloc(mySig.length + sodium.crypto_secretbox_MACBYTES)
        sodium.crypto_secretbox_easy(payload, mySig, handshakeState.zeroNonce, key2)

        socket.write(payload)

        handshakeState.done = true
        break
      }
    }
  }

  function handleAuthenticatedChunk (chunk, enc, done) {}

  return this
}
