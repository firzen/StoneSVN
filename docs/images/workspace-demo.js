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
    if (command === 'svn_incoming_state') return { revision: 130, logs: completed ? [] : [{
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
  await document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'update' })
  await (await import('/node_modules/.vite/deps/vue.js')).nextTick()
}
