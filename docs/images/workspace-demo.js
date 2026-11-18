// Run in the local Vite page through Playwright CLI eval. Read-only demo data;
// no SVN process, repository access or filesystem changes are performed.
export default (async () => {
  const { useWorkspaceStore } = await import('/src/stores/workspace.ts')
  const { updateSettings } = (await import('/src/composables/useSettings.ts')).useSettings()
  const path = '/workspaces/stone-demo'
  const files = [
    ['src/config.ts', 'modified'],
    ['src/views/WorkspaceView.vue', 'modified'],
    ['docs/user-guide.md', 'modified'],
    ['docs/images/workspace.png', 'added'],
    ['src/legacy-config.ts', 'deleted'],
    ['notes/release-checklist.md', 'unversioned'],
  ].map(([path, status_code]) => ({ path, status_code, status: status_code,
    prop_status: 'none', locked: false, history: false, switched: false }))
  const info = { path, url: 'https://svn.example.com/stone-demo/trunk',
    repository_root: 'https://svn.example.com/stone-demo', revision: 128,
    node_kind: 'dir', schedule: 'normal' }
  const diff = `Index: src/config.ts
===================================================================
--- src/config.ts\t(revision 128)
+++ src/config.ts\t(working copy)
@@ -1,7 +1,8 @@
 export const workspaceConfig = {
-  theme: 'auto',
+  theme: 'light',
   language: 'zh-CN',
-  refreshInterval: 60000,
+  refreshInterval: 30000,
+  showDiffPreview: true,
   confirmBeforeRevert: true,
   encoding: 'utf-8',
 }
`
  window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
      if (command === 'workspace_children') {
        const entries = args.directory === '.'
          ? [['src', true], ['docs', true], ['notes', true], ['README.md', false]]
          : args.directory === 'src'
            ? [['src/config.ts', false], ['src/views', true], ['src/legacy-config.ts', false]]
            : []
        return entries.map(([path, directory]) => ({ path, name: path.split('/').pop(), directory }))
      }
      if (command === 'svn_property_details') return {
        info: { ...info, path: args.file, url: `${info.url}/${args.file}`, node_kind: 'file' },
        directory: false, link_target: null, size: 256, modified: '2026-10-16T02:00:00Z', editable: true,
        properties: [
          { name: 'svn:eol-style', value: 'LF', binary: false },
          { name: 'svn:mime-type', value: 'text/plain', binary: false },
          { name: 'demo:module', value: 'workspace', binary: false },
        ],
      }
      if (command === 'svn_connection_info') return info
      if (command === 'svn_file_preview') return { path: args.file, diff, old_revision: 128, new_revision: 128, preview_kind: 'text', image_data: null, can_open: !args.oldRev && !args.newRev && args.file !== 'src/legacy-config.ts' }
      if (command === 'open_workspace_file') {
        window.__documentationOpenedFile = { ...args }
        return
      }
      if (command === 'svn_diff') return { path: args.file, diff, old_revision: 128, new_revision: 128 }
      if (command === 'svn_status') return files
      if (command === 'svn_info' || command === 'svn_remote_info') return info
      if (command === 'svn_local_revision') return 128
      if (command === 'svn_incoming_state') return { revision: 128, logs: [], total: 0 }
      if (command === 'svn_log' || command === 'svn_file_log' || command === 'svn_incoming_logs') return []
      throw new Error(`Documentation demo does not support ${command}`)
    },
  }
  updateSettings({ language: 'zh-CN', theme: 'light', gitignoreEnabled: false, diffFontSize: 13 })
  const store = useWorkspaceStore(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia)
  store.recentWorkspaces = []
  store.projectSummaries = {}
  for (const project of [path, '/workspaces/docs-site', '/workspaces/ui-components']) {
    store.rememberWorkspace(project)
  }
  store.setCurrentPath(path)
  store.setSvnInfo(info)
  store.setStatusList(files)
  store.setStatusIsStale(false)
  store.setLoading(false)
  store.setError(null)
  await (await import('/node_modules/.vite/deps/vue.js')).nextTick()
  document.querySelector('.file-path').click()
  await new Promise(resolve => setTimeout(resolve, 500))
  await document.fonts.ready
  return 'Documentation workspace ready (six example paths, r128)'
})()

// Display the property browser without invoking native dialogs or write commands.
export async function showPropertiesDemo() {
  const { propertyTree } = await import('/src/composables/usePropertyTree.ts')
  const path = '/workspaces/stone-demo'
  propertyTree.project(path).expanded = new Set(['.', 'src'])
  propertyTree.select(path, 'src/config.ts')
  await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'properties' })
  await propertyTree.load(path, '.')
  await propertyTree.load(path, 'src')
  await (await import('/node_modules/.vite/deps/vue.js')).nextTick()
  await document.fonts.ready
  await new Promise(resolve => setTimeout(resolve, 500))
}

// Update captures use fictional SVN responses; invoking the demo never runs SVN.
export async function showUpdateDemo() {
  const original = window.__TAURI_INTERNALS__.invoke
  let completed = false
  window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    if (command === 'svn_incoming_state') return { revision: 130, total: completed ? 0 : 2, logs: completed ? [] : [{
      revision: 130, author: 'demo', date: '2026-10-22T06:00:00Z', message: 'Improve workspace navigation',
      changed_paths: [{ action: 'M', path: '/trunk/src/config.ts' }, { action: 'A', path: '/trunk/docs/update-guide.md' }],
    }, { revision: 129, author: 'demo', date: '2026-10-21T03:00:00Z', message: 'Remove legacy configuration',
      changed_paths: [{ action: 'D', path: '/trunk/src/legacy-config.ts' }],
    }] }
    if (command === 'svn_update') {
      completed = true
      return { success: true, warning: null, error: null, output: 'U    src/config.ts\nA    docs/update-guide.md\nD    src/legacy-config.ts\nUpdated to revision 130.',
        files: [['src/config.ts', 'M'], ['docs/update-guide.md', 'A'], ['src/legacy-config.ts', 'D'], ['docs', 'M']].map(([path, action]) => ({
          path, action, directory: path === 'docs', old_revision: 128, new_revision: 130, target: `https://svn.example.com/stone-demo/trunk/${path}@130`,
        })) }
    }
    if (command === 'svn_local_revision') return completed ? 130 : 128
    return original(command, args)
  }
  const incoming = (await import('/src/composables/useIncomingUpdates.ts')).useIncomingUpdates()
  incoming.invalidate('/workspaces/stone-demo')
  await incoming.check('/workspaces/stone-demo', true)
  await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'update' })
  await (await import('/node_modules/.vite/deps/vue.js')).nextTick()
}

// Fictional conflicts for comparison captures; no real working-copy mutation.
export async function showConflictDemo(kind = 'text', lineCount = 320) {
  const app = document.querySelector('#app').__vue_app__
  const store = (await import('/src/stores/workspace.ts')).useWorkspaceStore(app.config.globalProperties.$pinia)
  const path = kind === 'property' ? 'config/shipping-policy.json' : kind === 'tree' ? 'src/legacy-shipping.ts' : 'src/shipping-policy.ts'
  const base = Array.from({ length: lineCount }, (_, i) => {
    if (i % 8 === 0) return `export function shippingRule${i}(order: Order) {`
    if (i % 8 === 1) return '  const destination = order.destination'
    if (i % 8 === 2) return '  const amount = order.subtotal'
    if (i % 8 === 3) return '  return calculateRate(destination, amount, "standard")'
    if (i % 8 === 4) return '}'
    if (i % 8 === 5) return ''
    if (i % 8 === 6) return '// Validate the destination before calculating the shipping rate.'
    return ''
  })
  const points = [19, Math.floor(lineCount / 2 / 8) * 8 + 3, lineCount - 13]
  const local = [...base], incoming = [...base], working = [...base]
  for (const [i, line] of points.entries()) {
    local[line] = `  return calculateRate(destination, amount, "scheduled-${i + 1}")`
    incoming[line] = `  return calculateRate(destination, amount, "express-${i + 1}")`
    working[line] = `<<<<<<< .mine\n${local[line]}\n||||||| .r128\n${base[line]}\n=======\n${incoming[line]}\n>>>>>>> .r129`
  }
  const text = lines => lines.join('\n') + '\n'
  const details = {
    text: kind === 'text', property: kind === 'property', tree: kind === 'tree',
    operation: 'update', reason: kind === 'tree' ? 'edit' : '', action: kind === 'tree' ? 'delete' : '', directory: false,
    working: text(working), local: text(local), incoming: text(incoming), base: text(base),
    properties: kind === 'property' ? [{ name: 'demo:shipping-policy', local: '{\n  "delivery": "scheduled",\n  "retryLimit": 3\n}', base: '{\n  "delivery": "standard"\n}', incoming: '{\n  "delivery": "express",\n  "retryLimit": 5\n}', incoming_known: true }] : [],
    rejection: null, unavailable: [], token: `documentation-${kind}`,
  }
  const originalInvoke = window.__TAURI_INTERNALS__.invoke
  let resolved = false
  const statuses = [
    { path, status: 'conflicted', status_code: kind === 'property' ? 'modified' : 'conflicted', prop_status: kind === 'property' ? 'conflicted' : 'none', tree_conflicted: kind === 'tree', text_conflicted: kind === 'text', locked: false, history: false, switched: false },
    { path: 'src/config.ts', status: 'modified', status_code: 'modified', prop_status: 'none', locked: false, history: false, switched: false },
  ]
  window.__TAURI_INTERNALS__.invoke = async (command, args) => {
    if (command === 'svn_conflict_details') return details
    if (command === 'svn_apply_conflict') {
      window.__documentationConflictResolution = args
      resolved = true
      return ''
    }
    if (command === 'svn_status') return resolved ? statuses.map(s => ({ ...s, status_code: 'modified', prop_status: 'none', tree_conflicted: false, text_conflicted: false })) : statuses
    return originalInvoke(command, args)
  }
  store.setStatusList(statuses)
  await app.config.globalProperties.$router.push({ name: 'diff', query: { path } })
  await (await import('/node_modules/.vite/deps/vue.js')).nextTick()
}
