const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const DEFAULT_TIMEOUT_MS = 20_000

export interface FetchOptions {
  readonly method?: 'GET' | 'POST'
  readonly body?: unknown
  readonly timeoutMs?: number
  readonly accept?: string
}

async function request(url: string, options: FetchOptions): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: options.accept ?? 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await request(url, options)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return (await response.json()) as T
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await request(url, { accept: 'text/xml,application/xml', ...options })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`)
  return await response.text()
}

/** Polite spacing between requests to the same host, with jitter. */
export function delay(baseMs: number): Promise<void> {
  const jitter = Math.random() * baseMs * 0.4
  return new Promise((resolve) => setTimeout(resolve, baseMs + jitter))
}
