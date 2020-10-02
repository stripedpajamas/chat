// https://github.com/stripedpajamas/crdt-playground.git
//
// One of the most basic CRDTs; this Counter is state-based,
// meaning that the entire state is sent to other nodes when
// merging.
class Counter {
  constructor (id) {
    // state holds all the nodes' values, keyed by id
    this.state = []
    this.id = id
  }

  // inc increments this node's value in this node's state
  inc () {
    this.state[this.id] = (this.state[this.id] || 0) + 1
  }

  // value returns the sum of all nodes' values according to this node
  value () {
    return this.state.reduce((acc, el) => acc + el, 0)
  }

  getState () {
    return this.state
  }

  // merge sets this node's state to the maximum value of each
  // node between local state and other state
  merge (otherState) {
    otherState.forEach((node, idx) => {
      if (typeof this.state[idx] === 'undefined') {
        this.state[idx] = node
      } else {
        this.state[idx] = Math.max(this.state[idx], node)
      }
    })
    this.state.forEach((node, idx) => {
      if (typeof otherState[idx] !== 'undefined') {
        this.state[idx] = Math.max(otherState[idx], node)
      }
    })
  }
}

module.exports = Counter
