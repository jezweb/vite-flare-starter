/**
 * Centralized API Client
 *
 * DRY wrapper for fetch operations with:
 * - Automatic credentials handling
 * - Type-safe responses
 * - Error extraction and throwing
 * - JSON request/response handling
 */

/**
 * API Error with status code and optional details
 */
export interface ApiError extends Error {
  status: number
  code?: string
  details?: Record<string, unknown>
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
}

/**
 * Create an API error from a response
 */
async function createApiError(response: Response): Promise<ApiError> {
  let errorData: {
    error?: string
    message?: string
    code?: string
    details?: Record<string, unknown>
  } = {}

  try {
    errorData = await response.json()
  } catch {
    // Response is not JSON
  }

  const error = new Error(
    errorData.error || errorData.message || `Request failed with status ${response.status}`
  ) as ApiError

  error.status = response.status
  error.code = errorData.code
  error.details = errorData.details

  return error
}

/**
 * Build URL with query parameters
 */
function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(path, window.location.origin)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return url.toString()
}

/**
 * Make an API request
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers: customHeaders, ...fetchOptions } = options

  const headers = new Headers(customHeaders)

  // Set JSON content type for requests with body
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(buildUrl(path, params), {
    ...fetchOptions,
    headers,
    credentials: 'include', // Always include cookies
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    throw await createApiError(response)
  }

  // Handle empty responses
  const contentLength = response.headers.get('Content-Length')
  if (contentLength === '0' || response.status === 204) {
    return {} as T
  }

  return response.json()
}

/**
 * API Client with typed methods
 *
 * @example
 * // GET request
 * const data = await apiClient.get<User>('/api/user')
 *
 * // POST with body
 * const result = await apiClient.post<Result>('/api/items', { name: 'New Item' })
 *
 * // DELETE
 * await apiClient.delete('/api/items/123')
 *
 * // With query params
 * const items = await apiClient.get<Item[]>('/api/items', { params: { page: 1 } })
 */
export const apiClient = {
  /**
   * GET request
   */
  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return request<T>(path, { ...options, method: 'GET' })
  },

  /**
   * POST request
   */
  post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return request<T>(path, { ...options, method: 'POST', body })
  },

  /**
   * PATCH request
   */
  patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return request<T>(path, { ...options, method: 'PATCH', body })
  },

  /**
   * PUT request
   */
  put<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T> {
    return request<T>(path, { ...options, method: 'PUT', body })
  },

  /**
   * DELETE request
   */
  delete<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<T> {
    return request<T>(path, { ...options, method: 'DELETE' })
  },

  /**
   * Upload file (multipart/form-data)
   */
  async upload<T>(
    path: string,
    formData: FormData,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<T> {
    const response = await fetch(buildUrl(path, options?.params), {
      method: 'POST',
      credentials: 'include',
      body: formData,
      ...options,
    })

    if (!response.ok) {
      throw await createApiError(response)
    }

    return response.json()
  },
}

/**
 * Type helper for standard API responses
 */
export interface ApiResponse<T> {
  data: T
  message?: string
}

/**
 * Type for paginated responses
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
