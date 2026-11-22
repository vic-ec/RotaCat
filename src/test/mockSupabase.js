// A recording stand-in for the Supabase client, for lib tests. Every call
// chain ends in `calls` as { table, method, payload, filters }, and a test
// decides what each read returns with `respond(table, fn)`. One shared
// instance per test file (import it in both the vi.mock factory and the
// test), reset with `reset()` in beforeEach.
export function createSupabaseMock() {
  const state = { calls: [], responders: {}, rpcCalls: [], rpcResponders: {} }
  const supabase = {
    from(table) {
      const call = { table, method: 'select', payload: null, filters: [], single: false }
      const builder = {
        select(cols) { if (call.method === 'select') call.payload = cols; call.selectAfter = cols; return builder },
        update(p) { call.method = 'update'; call.payload = p; return builder },
        insert(p) { call.method = 'insert'; call.payload = p; return builder },
        delete() { call.method = 'delete'; return builder },
        eq(c, v) { call.filters.push(['eq', c, v]); return builder },
        neq(c, v) { call.filters.push(['neq', c, v]); return builder },
        in(c, v) { call.filters.push(['in', c, v]); return builder },
        is(c, v) { call.filters.push(['is', c, v]); return builder },
        not(c, op, v) { call.filters.push(['not', c, op, v]); return builder },
        gte(c, v) { call.filters.push(['gte', c, v]); return builder },
        lte(c, v) { call.filters.push(['lte', c, v]); return builder },
        order() { return builder },
        limit() { return builder },
        single() { call.single = true; return builder },
        maybeSingle() { call.single = true; return builder },
        then(resolve, reject) {
          state.calls.push(call)
          const responder = state.responders[table]
          let out = { data: call.method === 'select' ? [] : null, error: null }
          try {
            if (responder) {
              const r = responder(call)
              if (r !== undefined) out = r && typeof r === 'object' && ('data' in r || 'error' in r) ? r : { data: r, error: null }
            }
          } catch (e) { return Promise.reject(e).then(resolve, reject) }
          if (call.single && Array.isArray(out.data)) out = { ...out, data: out.data[0] ?? null }
          return Promise.resolve(out).then(resolve, reject)
        },
      }
      return builder
    },
    rpc(name, args) {
      state.rpcCalls.push({ name, args })
      const r = state.rpcResponders[name]
      return Promise.resolve(r ? r(args) : { data: null, error: null })
    },
  }
  return {
    supabase,
    calls: state.calls,
    rpcCalls: state.rpcCalls,
    respond(table, fn) { state.responders[table] = fn },
    respondRpc(name, fn) { state.rpcResponders[name] = fn },
    reset() {
      state.calls.length = 0
      state.rpcCalls.length = 0
      for (const k of Object.keys(state.responders)) delete state.responders[k]
      for (const k of Object.keys(state.rpcResponders)) delete state.rpcResponders[k]
    },
    find(table, method) { return state.calls.filter(c => c.table === table && (!method || c.method === method)) },
  }
}

export const mock = createSupabaseMock()
