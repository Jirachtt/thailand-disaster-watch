function isRetryableRequestError(error) {
  const status = Number(error?.statusCode ?? error?.status ?? error?.response?.status)
  if (!Number.isFinite(status)) return true
  return status === 408 || status === 429 || status >= 500
}

/**
 * Client-only API loader with request deduplication and one bounded retry.
 *
 * Nuxt useFetch cancels an existing AsyncData request when refresh() is called
 * again by default. During a reload that cancellation can leave the shared
 * AsyncData promise pending. Keeping the request lifecycle here guarantees
 * that pending is cleared after either success, retry exhaustion, or timeout.
 */
export function useResilientFetch(url, options = {}) {
  const timeout = options.timeout ?? 18_000
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2)
  const retryDelay = Math.max(0, options.retryDelay ?? 250)
  const data = shallowRef(options.default?.() ?? null)
  const pending = ref(false)
  const error = shallowRef(null)

  let activeRequest = null
  let activeRequestUrl = ''
  let activeController = null
  let requestRevision = 0
  let disposed = false

  async function waitBeforeRetry() {
    if (!retryDelay) return
    await new Promise(resolve => setTimeout(resolve, retryDelay))
  }

  function refresh() {
    if (disposed) return Promise.resolve(data.value)

    const requestUrl = typeof url === 'function' ? url() : url
    if (typeof requestUrl !== 'string' || !requestUrl) {
      requestRevision += 1
      activeController?.abort()
      activeRequest = null
      activeRequestUrl = ''
      activeController = null
      pending.value = false
      return Promise.resolve(null)
    }

    if (activeRequest && activeRequestUrl === requestUrl) return activeRequest

    // A reactive URL can change while its previous request is still running
    // (for example when a different water station is selected). Abort that
    // request and guard every state write with a revision so a late response
    // can never overwrite the newly selected station.
    activeController?.abort()
    const controller = new AbortController()
    const revision = ++requestRevision
    activeController = controller
    activeRequestUrl = requestUrl

    pending.value = true
    error.value = null

    const request = (async () => {
      let lastError = null

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (disposed || revision !== requestRevision) break
        try {
          const response = await $fetch(requestUrl, {
            timeout,
            retry: 0,
            ...options.fetchOptions,
            signal: controller.signal,
          })
          if (!disposed && revision === requestRevision) data.value = response
          return response
        } catch (requestError) {
          lastError = requestError
          const canRetry = !disposed
            && revision === requestRevision
            && attempt < maxAttempts
            && isRetryableRequestError(requestError)
          if (!canRetry) break
          await waitBeforeRetry()
        }
      }

      if (!disposed && revision === requestRevision) error.value = lastError
      return null
    })().finally(() => {
      if (!disposed && revision === requestRevision) pending.value = false
      if (activeRequest === request) {
        activeRequest = null
        activeRequestUrl = ''
        activeController = null
      }
    })

    activeRequest = request
    return request
  }

  onScopeDispose(() => {
    disposed = true
    requestRevision += 1
    activeController?.abort()
    pending.value = false
    activeRequest = null
    activeRequestUrl = ''
    activeController = null
  })

  return { data, pending, error, refresh }
}
