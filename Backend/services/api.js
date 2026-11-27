const TOKEN_KEY = 'munaco_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)

export const setToken = (token) => (
  token
    ? localStorage.setItem(TOKEN_KEY, token)
    : localStorage.removeItem(TOKEN_KEY)
)

export async function api(path, { method = 'GET', body } = {}) {
  let response

  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken()
          ? { Authorization: `Bearer ${getToken()}` }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error(
      'Cannot reach the server. Check that the API is running (npm run dev in the server folder).',
    )
  }

  const data = await response.json().catch(() => ({}))

  if (response.status === 401 && path !== '/auth/login') {
    setToken(null)
    window.dispatchEvent(new Event('munaco:signed-out'))
  }

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong.')
  }

  return data
}

export function qs(params) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) search.set(key, value)
  })
  const output = search.toString()
  return output ? `?${output}` : ''
}