import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

function inlineScript(file: string): string {
  const html = readFileSync(new URL(file, import.meta.url), 'utf8')
  const match = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error(`Missing routing script in ${file}`)
  return match[1]
}

const redirect = inlineScript('../public/404.html')
const restore = inlineScript('../index.html')
const origin = 'https://natans040.github.io'
const base = '/Plataforma-Engmarq-Solution/'

function redirectURL(input: string): string | undefined {
  let target: string | undefined
  const location = Object.assign(new URL(input), {
    replace: (url: string) => { target = url },
  })
  runInNewContext(redirect, { window: { location }, URL })
  return target
}

function restoreURL(input: string): string | undefined {
  let target: string | undefined
  const location = new URL(input)
  const history = {
    replaceState: (_state: unknown, _title: string, url: string) => {
      target = new URL(url, location.origin).href
    },
  }
  runInNewContext(restore, { location, history, URL, URLSearchParams })
  return target
}

describe('GitHub Pages SPA fallback', () => {
  it.each([
    'documentos',
    'login?next=%2Fdocumentos&search=a%26b',
    'colaboradores?search=~and~#detalhes',
    'documentos#access_token=synthetic-token',
  ])('restores %s without duplicating the repository prefix', route => {
    const original = origin + base + route
    const intermediate = redirectURL(original)
    expect(intermediate).toBeDefined()
    expect(restoreURL(intermediate!)).toBe(original)
    expect(new URL(intermediate!).search).not.toContain('synthetic-token')
  })

  it('does not redirect the index or paths outside this project', () => {
    expect(redirectURL(origin + base)).toBeUndefined()
    expect(redirectURL(origin + '/another-project/documentos')).toBeUndefined()
  })

  it('rejects traversal outside the project during restoration', () => {
    const url = new URL(base, origin)
    url.searchParams.set('__spa', '../../outside')
    expect(restoreURL(url.href)).toBeUndefined()
  })
})
