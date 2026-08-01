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
  let disposed = false

  async function waitBeforeRetry() {
    if (!retryDelay) return
    await new Promise(resolve => setTimeout(resolve, retryDelay))
  }

  function refresh() {
    if (disposed) return Promise.resolve(data.value)
    if (activeRequest) return activeRequest

    pending.value = true
    error.value = null

    const request = (async () => {
      let lastError = null

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await $fetch(url, {
            timeout,
            retry: 0,
            ...options.fetchOptions,
          })
          if (!disposed) data.value = response
          return response
        } catch (requestError) {
          lastError = requestError
          const canRetry = !disposed && attempt < maxAttempts && isRetryableRequestError(requestError)
          if (!canRetry) break
          await waitBeforeRetry()
        }
      }

      if (!disposed) error.value = lastError
      return null
    })().finally(() => {
      if (!disposed) pending.value = false
      if (activeRequest === request) activeRequest = null
    })

    activeRequest = request
    return request
  }

  onScopeDispose(() => {
    disposed = true
    pending.value = false
    activeRequest = null
  })

  return { data, pending, error, refresh }
}
