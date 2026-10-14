/** Parses `v1.2.3` / `1.2.3`; prerelease or malformed tags return null. */
export function parseStableVersion(tag: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim())
  return match ? match.slice(1).map(Number) : null
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseStableVersion(candidate)
  const now = parseStableVersion(current)
  if (!next || !now) return false
  for (let i = 0; i < 3; i++) {
    if (next[i] !== now[i]) return next[i] > now[i]
  }
  return false
}
