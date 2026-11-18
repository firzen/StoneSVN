export interface ConflictBlock {
  start: number
  end: number
  line: number
  local: string
  base: string | null
  incoming: string
}
/** SVN markers are whole lines; preserve every other byte, including CRLF. */
export function conflictBlocks(text: string): ConflictBlock[] {
  const lines = [...text.matchAll(/[^\n]*\n|[^\n]+$/g)]
  const result: ConflictBlock[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i][0].startsWith('<<<<<<< ')) continue
    const start = i
    let base = -1, split = -1, end = -1
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j][0].replace(/\r?\n$/, '')
      if (line.startsWith('<<<<<<< ')) break
      if (line.startsWith('||||||| ')) base = j
      if (line === '=======') split = j
      if (line.startsWith('>>>>>>> ')) { end = j; break }
    }
    if (split < 0 || end < 0 || (base >= 0 && base > split)) continue
    const join = (from: number, to: number) => lines.slice(from, to).map(line => line[0]).join('')
    result.push({ start: lines[start].index!, end: lines[end].index! + lines[end][0].length, line: start + 1,
      local: join(start + 1, base < 0 ? split : base), base: base < 0 ? null : join(base + 1, split), incoming: join(split + 1, end) })
    i = end
  }
  return result
}
export function mergeConflictChoices(text: string, blocks: ConflictBlock[], choices: Record<number, 'local' | 'incoming'>): string {
  let result = '', offset = 0
  blocks.forEach((block, index) => {
    result += text.slice(offset, block.start)
    result += choices[index] ? block[choices[index]] : text.slice(block.start, block.end)
    offset = block.end
  })
  return result + text.slice(offset)
}
export function hasConflictMarkers(text: string) {
  return /^(<<<<<<< |\|\|\|\|\|\|\| |>>>>>>> |=======\r?$)/m.test(text)
}
