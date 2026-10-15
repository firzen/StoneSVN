import type { StashFile, StashHunk } from '@/types'

export function parseUnifiedDiff(path: string, diff: string): StashFile | null {
  return parseUnifiedDiffFiles(path, diff)[0] || null
}

// Directory diffs contain independent Index sections. Preserve each file's
// header so selecting a later file's hunk cannot apply it to the first file.
export function parseUnifiedDiffFiles(path: string, diff: string): StashFile[] {
  const lines = diff.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const starts = lines.flatMap((line, index) => line.startsWith('Index: ') ? [index] : [])
  if (starts.length === 0) starts.push(0)
  return starts.flatMap((start, index) => {
    const section = lines.slice(start, starts[index + 1] ?? lines.length)
    const filePath = (section[0]?.startsWith('Index: ') ? section[0].slice(7) : path).replace(/\\/g, '/')
    const file = parseFileDiff(filePath, section)
    return file ? [file] : []
  })
}

function parseFileDiff(path: string, lines: string[]): StashFile | null {
  const firstHunk = lines.findIndex(line => line.startsWith('@@'))
  if (firstHunk < 0) return null

  const header = lines.slice(0, firstHunk)
  const hunks: StashHunk[] = []
  let index = firstHunk

  while (index < lines.length) {
    if (!lines[index].startsWith('@@')) {
      index += 1
      continue
    }

    const headerLine = lines[index]
    const range = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(headerLine)
    if (!range) {
      index += 1
      continue
    }
    let oldRemaining = Number(range[2] ?? 1)
    let newRemaining = Number(range[4] ?? 1)
    const hunkLines: string[] = []
    index += 1
    // Stop at the hunk's declared length. SVN property changes after a text
    // hunk must not become part of the selected text patch.
    while (index < lines.length && (oldRemaining > 0 || newRemaining > 0 || lines[index].startsWith('\\'))) {
      const line = lines[index]
      if (line.startsWith(' ') || line.startsWith('-')) oldRemaining -= 1
      if (line.startsWith(' ') || line.startsWith('+')) newRemaining -= 1
      hunkLines.push(line)
      index += 1
    }

    hunks.push({
      id: `${path}::${hunks.length}`,
      header: headerLine,
      lines: hunkLines,
      added: hunkLines.filter(line => line.startsWith('+')).length,
      removed: hunkLines.filter(line => line.startsWith('-')).length,
    })
  }

  return hunks.length > 0 ? { path, header, hunks } : null
}

export function buildPatch(files: StashFile[], selectedHunks: Set<string>): string {
  const patches: string[] = []

  for (const file of files) {
    const selected = file.hunks.filter(hunk => selectedHunks.has(hunk.id))
    if (selected.length === 0) continue

    patches.push([
      ...file.header,
      ...selected.flatMap(hunk => [hunk.header, ...hunk.lines]),
    ].join('\n'))
  }

  return patches.length > 0 ? `${patches.join('\n')}\n` : ''
}

export function createStashId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `stash-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
