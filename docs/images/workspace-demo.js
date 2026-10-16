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
      if (command === 'svn_connection_info') return info
      if (command === 'svn_file_preview') return { path: args.file, diff, old_revision: 128, new_revision: 128, preview_kind: 'text', image_data: null, can_open: false }
      if (command === 'svn_diff') return { path: args.file, diff, old_revision: 128, new_revision: 128 }
      if (command === 'svn_status') return files
      if (command === 'svn_info') return info
      if (command === 'svn_local_revision') return 128
      throw new Error(`Documentation demo does not support ${command}`)
    },
  }
  updateSettings({ language: 'zh-CN', theme: 'light', gitignoreEnabled: false })
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
