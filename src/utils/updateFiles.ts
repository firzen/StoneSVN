export interface UpdateListRow {
  path: string
  status: string
  directory?: boolean
}
export function pathParts(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/\/$/, '')
  const index = normalized.lastIndexOf('/')
  return { name: normalized.slice(index + 1) || path, directory: normalized.slice(0, index + 1) || '.' }
}
export function filterUpdateRows(rows: UpdateListRow[], status: string, query: string) {
  const search = query.trim().toLocaleLowerCase()
  return rows.filter(row => (!status || row.status === status) && row.path.toLocaleLowerCase().includes(search))
    .sort((a, b) => Number(b.status === 'conflicted') - Number(a.status === 'conflicted')
      || pathParts(a.path).directory.localeCompare(pathParts(b.path).directory)
      || pathParts(a.path).name.localeCompare(pathParts(b.path).name))
}
