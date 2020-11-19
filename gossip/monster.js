const { EventEmitter } = require('events')
const sodium = require('sodium-native')

class ProtocolMessages extends EventEmitter {}

// socket is duplex stream; init is whether or not we initiated the connection
function Protocol (socket, init, opts) {
  // a place to buffer incoming data (since it comes in chunks)
  let buf = Buffer.alloc(0)

  const out = new ProtocolMessages()

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
      public: init ? opts.remote.public : null,
      ephPk: null,
      sig: null
    }
  }
  const authState = {
    receivedHeader: false,
    bodyMac: null,
    receivedBytes: 0,
    expectedBytes: 0,
    sendKey: Buffer.alloc(sodium.crypto_generichash_BYTES),
    sendNonce: Buffer.alloc(sodium.crypto_auth_BYTES),
    receiveKey: Buffer.alloc(sodium.crypto_generichash_BYTES),
    receiveNonce: Buffer.alloc(sodium.crypto_auth_BYTES),
    local: {},
    remote: {},
  }

  // init ephemeral keys for this session
  sodium.crypto_box_keypair(handshakeState.local.ephPk, handshakeState.local.ephSk)
  handshakeState.zeroNonce.fill(0)

  // if we are the initiator, send first message
  if (init) {
    // create a tag for our ephemeral public key, keyed by the network ID
    const authTag = Buffer.alloc(sodium.crypto_auth_BYTES)
    sodium.crypto_auth(authTag, handshakeState.local.ephPk, handshakeState.netId)
    // send our ephemeral public key with the auth tag
    socket.write(Buffer.concat([authTag, handshakeState.local.ephPk]))
  }

  // handle a chunk of bytes recieved on the socket
  socket.on('data', function handleRawChunk (chunk) {
    if (handshakeState.done) {
      handleAuthenticatedChunk(chunk)
    } else {
      handleHandshakeChunk(chunk)
    }
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
    if (handshakeState.receivedBytes === stepSizes[step]) {
      if (init) handleClientHandshakeStep()
      else handleServerHandshakeStep()

      // in any case, we should increment step at this point and reset state
      handshakeState.step += 1
      handshakeState.receivedBytes = 0
      buf = Buffer.alloc(0)
    }

    // put whatever we didn't use into our buf
    if (unused.length) {
      buf = unused
    }
  }

  function handleClientHandshakeStep () {
    const { step } = handshakeState
    switch (step) {
      case 0: {
        const remoteAuthTag = buf.slice(0, 32)
        handshakeState.remote.ephPk = buf.slice(32)
        const valid = sodium.crypto_auth_verify(remoteAuthTag, handshakeState.remote.ephPk, handshakeState.netId)
        if (!valid) {
          socket.end()
        }

        // make an curve25519 pk out of the remote's long term ed25519 pk
        const remoteLongTermPkCurve = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES)
        sodium.crypto_sign_ed25519_pk_to_curve25519(remoteLongTermPkCurve, handshakeState.remote.public)

        // derive 2 shared secrets and hash the first
        sodium.crypto_scalarmult(handshakeState.local.sharedSecret0, handshakeState.local.ephSk, handshakeState.remote.ephPk)
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
        computeAuthState()
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
        computeAuthState()
        break
      }
    }
  }

  function handleAuthenticatedChunk (chunk) {
    let unused = Buffer.alloc(0)
    if (!authState.receivedHeader) { // pull in the 34 byte header
      if (authState.receivedBytes < 34) {
        const slice = chunk.slice(0, 34 - authState.receivedBytes)
        buf = Buffer.concat([buf, slice])
        if (chunk.length > slice.length) {
          unused = chunk.slice(slice.length)
        }
        authState.receivedBytes += slice.length
      }

      if (authState.receivedBytes === 34) {
        const headerPlaintext = Buffer.alloc(buf.length - sodium.crypto_secretbox_MACBYTES)
        const headerNonce = nextReceiveNonce()
        const decrypted = sodium.crypto_secretbox_open_easy(headerPlaintext, buf, headerNonce, authState.receiveKey)
        if (!decrypted) {
          socket.end()
          return
        }

        const bodyLength = headerPlaintext.readIntBE(0, 2)

        authState.receivedHeader = true
        authState.expectedBytes = bodyLength
        authState.bodyMac = headerPlaintext.slice(2)
        buf = Buffer.alloc(0)

        // reset received bytes in preparation for the body
        authState.receivedBytes = 0
      }
    } else { // we have header; get the body
      if (authState.receivedBytes < authState.expectedBytes) {
        const slice = chunk.slice(0, authState.expectedBytes - authState.receivedBytes)
        buf = Buffer.concat([buf, slice])
        if (chunk.length > slice.length) {
          unused = chunk.slice(slice.length)
        }
        authState.receivedBytes += slice.length
      }

      if (authState.receivedBytes === authState.expectedBytes) { // have the full body
        const fullBody = Buffer.concat([authState.bodyMac, buf])

        const bodyPlaintext = Buffer.alloc(fullBody.length - sodium.crypto_secretbox_MACBYTES)
        const bodyNonce = nextReceiveNonce()
        const decrypted = sodium.crypto_secretbox_open_easy(bodyPlaintext, fullBody, bodyNonce, authState.receiveKey)
        if (!decrypted) {
          socket.end()
          return
        }

        // emit the decrypted message
        out.emit('data', bodyPlaintext)

        // reset state since we've just finished a complete transaction
        authState.receivedBytes = 0
        authState.expectedBytes = 0
        authState.bodyMac = null
        authState.receivedHeader = false
      }
    }

    // recurse with any unused bytes
    if (unused.length) {
      handleAuthenticatedChunk(unused)
    }
  }

  function computeAuthState () {
    // key = hash(hash(hash(netId || ss0 || ss1 || ss2)) || remotePk)
    sodium.crypto_generichash(authState.sendKey, Buffer.concat([
      handshakeState.netId,
      handshakeState.local.sharedSecret0,
      handshakeState.local.sharedSecret1,
      handshakeState.local.sharedSecret2
    ]))
    sodium.crypto_generichash(authState.sendKey, authState.sendKey)
    sodium.crypto_generichash(authState.sendKey, Buffer.concat([
      authState.sendKey,
      handshakeState.remote.public
    ]))
    sodium.crypto_generichash(authState.receiveKey, Buffer.concat([
      handshakeState.netId,
      handshakeState.local.sharedSecret0,
      handshakeState.local.sharedSecret1,
      handshakeState.local.sharedSecret2
    ]))
    sodium.crypto_generichash(authState.receiveKey, authState.receiveKey)
    sodium.crypto_generichash(authState.receiveKey, Buffer.concat([
      authState.receiveKey,
      handshakeState.local.public
    ]))

    sodium.crypto_auth(authState.sendNonce, handshakeState.remote.ephPk, handshakeState.netId)
    authState.sendNonce = authState.sendNonce.slice(0, 24)
    sodium.crypto_auth(authState.receiveNonce, handshakeState.local.ephPk, handshakeState.netId)
    authState.receiveNonce = authState.receiveNonce.slice(0, 24)

    authState.remote.public = handshakeState.remote.public
    authState.local.public = handshakeState.local.public
    authState.local.secret = handshakeState.local.secret

    out.emit('authenticated')
  }

  function nextSendNonce () {
    const nonce = Buffer.from(authState.sendNonce)
    sodium.sodium_increment(authState.sendNonce)

    return nonce
  }

  function nextReceiveNonce () {
    const nonce = Buffer.from(authState.receiveNonce)
    sodium.sodium_increment(authState.receiveNonce)

    return nonce
  }

  // a function that encrypts and packages some data
  // and then sends it to the remote peer
  function send (bytes) {
    // get some nonces
    const headerNonce = nextSendNonce()
    const bodyNonce = nextSendNonce()

    // put the body in a box
    let bodyCiphertext = Buffer.alloc(bytes.length + sodium.crypto_secretbox_MACBYTES)
    sodium.crypto_secretbox_easy(bodyCiphertext, bytes, bodyNonce, authState.sendKey)

    // slice off the mac 
    const mac = bodyCiphertext.slice(0, 16)
    bodyCiphertext = bodyCiphertext.slice(16)

    // encode the body length into 2 big endian bytes
    const bodyLength = Buffer.alloc(2)
    bodyLength.writeIntBE(bytes.length, 0, 2)

    // the header is the body length || body mac, put inside its own secret box
    const header = Buffer.concat([bodyLength, mac])
    const headerCiphertext = Buffer.alloc(header.length + sodium.crypto_secretbox_MACBYTES)
    sodium.crypto_secretbox_easy(headerCiphertext, header, headerNonce, authState.sendKey)

    // the final payload: enc(header) || enc(body)
    const payload = Buffer.concat([headerCiphertext, bodyCiphertext])

    // send it
    socket.write(payload)
  }

  // TESTING
  this.send = send
  this.messages = out
  return this
}

module.exports = { Protocol }
