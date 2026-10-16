import type { SvnStatus } from '@/types'

export interface GitignorePattern {
  negation: boolean
  regex: RegExp
  dirOnly: boolean
}

// Global filter rules are names or workspace-root paths, never ignore-file contents.
// All rules are inclusive; ! and # are ordinary filename characters.
export function parseFilterRules(content: string): GitignorePattern[] {
  return content.split('\n').map(line => line.trim().replace(/\\/g, '/')).filter(Boolean).flatMap(rule => {
    const anchored = rule.includes('/')
    const pattern = rule.split('/').filter(part => part && part !== '.').join('/')
    if (!pattern || pattern.split('/').includes('..')) return []
    let source = ''
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === '*') {
        if (pattern[i + 1] === '*') {
          while (pattern[i + 1] === '*') i++
          if (pattern[i + 1] === '/') { source += '(?:.*/)?'; i++ }
          else source += '.*'
        } else source += '[^/]*'
      } else if (pattern[i] === '?') source += '[^/]'
      else source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    return [{ negation: false, dirOnly: false, regex: new RegExp(`${anchored ? '^' : '(^|/)'}${source}(?:/|$)`, 'su') }]
  })
}

export function parseGitignore(content: string): GitignorePattern[] {
  const patterns: GitignorePattern[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    let pattern = trimmed
    let negation = false
    if (pattern.startsWith('!')) {
      negation = true
      pattern = pattern.slice(1).trimStart()
    }
    if (!pattern) continue

    const dirOnly = pattern.endsWith('/')
    if (dirOnly) pattern = pattern.slice(0, -1)

    const anchored = pattern.startsWith('/')
    if (anchored) pattern = pattern.slice(1)

    const regex = gitignorePatternToRegex(pattern, anchored)
    patterns.push({ negation, regex, dirOnly })
  }

  return patterns
}

function gitignorePatternToRegex(pattern: string, anchored: boolean): RegExp {
  let regexStr = ''

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        while (i + 1 < pattern.length && pattern[i + 1] === '*') i++
        if (i + 1 < pattern.length && pattern[i + 1] === '/') {
          regexStr += '(?:.*/)?'
          i++
        } else {
          regexStr += '.*'
        }
      } else {
        regexStr += '[^/]*'
      }
    } else if (ch === '?') {
      regexStr += '[^/]'
    } else if (ch === '[') {
      const closingBracket = pattern.indexOf(']', i + 1)
      if (closingBracket === -1) {
        regexStr += '\\['
        continue
      }

      let characterClass = pattern.slice(i + 1, closingBracket)
      if (characterClass.startsWith('!')) {
        characterClass = `^/${characterClass.slice(1)}`
      } else if (characterClass.startsWith('^')) {
        characterClass = `\\${characterClass}`
      }
      regexStr += `[${characterClass.replace(/\\/g, '\\\\')}]`
      i = closingBracket
    } else if (ch === '\\' && i + 1 < pattern.length) {
      i++
      const escaped = pattern[i]
      regexStr += '.+^${}()|[]\\'.includes(escaped) ? `\\${escaped}` : escaped
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      regexStr += '\\' + ch
    } else {
      regexStr += ch
    }
  }

  if (!anchored && !pattern.includes('/')) {
    return new RegExp(`(^|/)${regexStr}$`)
  }
  return new RegExp(`^${regexStr}$`)
}

function matchesPath(filePath: string, patterns: GitignorePattern[]): boolean {
  const normalPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  const candidates = [normalPath]
  let separator = normalPath.lastIndexOf('/')
  while (separator >= 0) {
    candidates.push(normalPath.slice(0, separator))
    separator = normalPath.lastIndexOf('/', separator - 1)
  }
  // The last matching rule wins. Traverse backwards to avoid testing earlier
  // rules once the answer is known, preserving negation and ancestor matching.
  for (let index = patterns.length - 1; index >= 0; index--) {
    const pattern = patterns[index]
    if (candidates.some(candidate => pattern.regex.test(candidate))) return !pattern.negation
  }
  return false
}

export function isIgnored(filePath: string, patterns: GitignorePattern[]): boolean {
  return matchesPath(filePath, patterns)
}

export function createGitignoreMatcher(patterns: GitignorePattern[], maxEntries = 10_000) {
  const cache = new Map<string, boolean>()
  return (filePath: string): boolean => {
    const cached = cache.get(filePath)
    if (cached !== undefined) return cached
    const ignored = matchesPath(filePath, patterns)
    if (maxEntries > 0) {
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!)
      cache.set(filePath, ignored)
    }
    return ignored
  }
}

export function filterByGitignore(
  statuses: SvnStatus[],
  patterns: GitignorePattern[],
): SvnStatus[] {
  if (patterns.length === 0) return statuses
  return statuses.filter(status => !isIgnored(status.path, patterns))
}
