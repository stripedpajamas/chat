1. Each person runs one or more Nodes.
1. Each Node contains one or more Keypairs.
1. A Keypair is a Public Key and Private Key.
1. Each Node maintains a single Datastore that is persisted to disk and read on bootup.
1. The Datastore contains separate stores within it: Log Set and Log Map
1. The Log Set represents the set of people whose messages will be displayed in the client. This set is not replicated between nodes.
1. The Log Set contains Log IDs. The Log IDs are Public Keys. If the Log Set contains a Log ID, client applications should display that Log's content.
1. The Log Map maps Log IDs to actual Logs.
1. A Log is modeled as a Grow-only Set of Entries.
1. An Entry is a struct of `{ content, signature, hash }`. A Log only contains Entries with unique hashes (it may be modeled as a Map<Hash,Entry> internally).
1. The `content` of an entry is a struct of `{ channel, text, timestamp }`. The `signature` property is the output of using the Private Key to sign `JSON.stringify([channel, text, timestamp])`. The `hash` property is a hash of `JSON.stringify([channel, text, timestamp])`.

```
Node {
  keypair: KeyPair,
  datastore: {
    logset: LogSet,
    logmap: LogMap,
  }
}

KeyPair {
  public: []byte,
  private: []byte,
}

// set of included/excluded logs (identified by public keys)
LogSet {
  include: [
    {
      id: KeyPair.public,
      ts: Date
    },
    ...
  ]
  exclude: [
    {
      id: KeyPair.public,
      ts: Date
    },
    ...
  ]
}

// map of public keys to logs
LogMap {
  [id: KeyPair.public]: [Log],
  [...]
}

// map of content hashes to content
Log {
  [hash]: [{ content: Content, signature, hash }],
  ...
}

// the only important stuff
Content {
  channel: String,
  text: String,
  timestamp: Date
}
```
