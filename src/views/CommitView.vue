<template>
  <div class="commit-view compact-commit">
    <div v-if="!workspaceStore.currentPath" class="no-workspace">
      <el-empty :description="$t('log.openWorkspaceFirst')">
        <el-button type="primary" @click="openWorkspace">
          <el-icon><FolderOpened /></el-icon>{{ $t('common.open') }}
        </el-button>
      </el-empty>
    </div>

    <div v-else class="commit-content">
      <el-alert v-if="workspaceStore.statusIsStale" :title="$t('workspace.cachedStatus')"
        type="warning" :closable="false" show-icon class="commit-warning" />

      <section class="message-panel" aria-labelledby="commit-message-heading">
        <div class="section-toolbar">
          <h2 id="commit-message-heading">{{ $t('commit.commitMessage') }}</h2>
          <span class="character-count">{{ $t('commit.characterCount', { count: commitMessage.length }) }}</span>
          <el-dropdown trigger="click" placement="bottom-end" :max-height="280"
            :disabled="loading || recentMessages.length === 0" @visible-change="loadRecentMessages" @command="useRecentMessage">
            <el-button size="small" text :aria-label="$t('commit.recentMessages')" :disabled="loading || recentMessages.length === 0">
              <el-icon><Calendar /></el-icon>{{ $t('commit.recentMessages') }}<el-icon class="recent-arrow"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu class="commit-recent-menu">
                <el-dropdown-item v-for="entry in recentMessages" :key="entry.id" :command="entry.message" :title="entry.message">
                  <span class="recent-message-text">{{ entry.message }}</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <el-input v-model="commitMessage" type="textarea" :rows="4" :disabled="loading" resize="none"
          :aria-label="$t('commit.commitMessage')" :placeholder="$t('commit.enterCommitMessage')" class="commit-textarea" />
      </section>

      <section class="changes-panel" aria-labelledby="commit-changes-heading">
        <div class="section-toolbar changes-toolbar">
          <h2 id="commit-changes-heading">{{ $t('commit.changes') }}</h2>
          <strong class="selection-count" aria-live="polite" :title="$t('commit.selectedCount', { count: selectedFiles.length })">
            {{ selectedFiles.length }}<span> / {{ allChangedFiles.length }}</span>
          </strong>
          <el-input v-model="searchQuery" :placeholder="$t('commit.searchFiles')" :aria-label="$t('commit.searchFiles')"
            :disabled="loading" clearable class="search-input" size="small">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <div class="filter-buttons" :aria-label="$t('commit.selectFiles')">
            <button v-for="filter in fileFilters" :key="filter.value" type="button"
              :aria-pressed="filterMode === filter.value" :class="{ active: filterMode === filter.value }"
              :disabled="loading" @click="filterMode = filter.value">{{ $t(filter.label) }}</button>
          </div>
        </div>
        <div v-if="scope" class="scope-bar">
          <span>{{ $t('commit.scope') }}:</span><span class="scope-path" :title="scope">{{ scope }}</span>
          <el-button link size="small" :disabled="loading" @click="setScope('')">{{ $t('commit.allDirectories') }}</el-button>
        </div>

        <div class="file-table-container" role="treegrid" :aria-label="$t('commit.selectFiles')"
          :aria-rowcount="flatRows.length + 1" aria-colcount="5" :aria-busy="workspaceStore.isLoading">
          <div class="file-table-heading" role="rowgroup">
            <div class="commit-columns" role="row" :style="{ transform: `translateX(-${tableScrollLeft}px)` }">
              <span class="checkbox-cell" role="columnheader">
                <input type="checkbox" class="commit-checkbox" :checked="allSelected"
                  :indeterminate="selectedFiles.length > 0 && !allSelected"
                  :disabled="loading || workspaceStore.statusIsStale || allChangedFiles.length === 0"
                  :aria-label="$t('commit.selectAll')" @change="toggleAll(($event.target as HTMLInputElement).checked)" />
              </span>
              <span role="columnheader">{{ $t('commit.file') }}</span>
              <span class="status-cell" role="columnheader">{{ $t('commit.status') }}</span>
              <span role="columnheader">{{ $t('commit.location') }}</span>
              <span role="columnheader" :aria-label="$t('common.diff')"></span>
            </div>
          </div>
          <VirtualViewport v-if="flatRows.length" ref="fileViewport" class="commit-files" role="rowgroup"
            :item-count="flatRows.length" :row-height="29" :content-width="640"
            :reset-key="`${workspaceStore.currentPath}|${scope}|${searchQuery}|${filterMode}`"
            @scroll="tableScrollLeft = ($event.target as HTMLElement).scrollLeft" @keydown.self="handleRowKey($event, -1)">
            <template #default="{ start, end }">
              <div v-for="(row, index) in flatRows.slice(start, end)" :key="row.node.path"
                class="commit-columns commit-file-row" :class="{ striped: (start + index) % 2, selected: isChecked(row.node) }" role="row"
                :aria-rowindex="start + index + 2" :aria-level="row.depth + 1" :aria-selected="isChecked(row.node)"
                :aria-expanded="row.node.children.length ? !collapsedPaths.has(row.node.path) : undefined"
                :tabindex="(activeRowPath || flatRows[0]?.node.path) === row.node.path ? 0 : -1"
                :data-row-index="start + index" @focusin="activeRowPath = row.node.path"
                @keydown="handleRowKey($event, start + index)" @click="handleRowClick($event, row.node)">
                <span class="checkbox-cell" role="gridcell">
                  <input type="checkbox" class="commit-checkbox" :checked="isChecked(row.node)" :indeterminate="isPartial(row.node)"
                    :disabled="loading || workspaceStore.statusIsStale" :aria-label="row.node.path"
                    @click.stop="toggleSelection(row.node, ($event.target as HTMLInputElement).checked, $event.shiftKey)" />
                </span>
                <span class="name-cell" role="gridcell" :style="{ paddingLeft: `${row.depth * 16 + 8}px` }">
                  <button v-if="row.node.children.length" type="button" class="expand-button" :disabled="loading"
                    :aria-expanded="!collapsedPaths.has(row.node.path)"
                    :aria-label="$t(collapsedPaths.has(row.node.path) ? 'commit.expandDirectory' : 'commit.collapseDirectory', { path: row.node.path })"
                    @click.stop="toggleExpanded(row.node.path)"><el-icon><ArrowRight v-if="collapsedPaths.has(row.node.path)" /><ArrowDown v-else /></el-icon></button>
                  <span v-else class="expand-spacer"></span>
                  <FileTypeIcon :path="row.node.path" :directory="!!row.node.children.length || !row.node.entry" :muted="!row.node.entry" />
                  <span class="tree-name" :class="{ 'directory-name': row.node.children.length || !row.node.entry, 'context-directory-name': !row.node.entry }" :title="row.node.path">
                    {{ row.node.path === '.' ? workspaceName : row.node.label }}
                  </span>
                  <small v-if="row.node.children.length" class="tree-count">{{ row.node.targets.length }}</small>
                  <button v-if="row.node.entry && row.node.children.length" type="button" class="subtree-select-button"
                    :disabled="loading || workspaceStore.statusIsStale" :aria-pressed="isSubtreeChecked(row.node)"
                    @click.stop="toggleSubtree(row.node, !isSubtreeChecked(row.node))">{{ $t('commit.selectWithChildren') }}</button>
                </span>
                <span class="status-cell" role="gridcell">
                  <span v-if="row.node.entry" class="status-badge" :class="getStatusClass(displayStatus(row.node.entry))"
                    :title="$t(getStatusLabelKey(displayStatus(row.node.entry)))" :aria-label="$t(getStatusLabelKey(displayStatus(row.node.entry)))">
                    {{ statusSymbol(row.node.entry) }}
                  </span>
                </span>
                <span class="file-location" role="gridcell" :title="parentLocation(row.node.path)">{{ parentLocation(row.node.path) }}</span>
                <span class="diff-cell" role="gridcell"><button v-if="row.node.entry" type="button" class="diff-link"
                  :disabled="loading" @click.stop="viewDiff(row.node.entry.path)">{{ $t('common.diff') }}</button></span>
              </div>
            </template>
          </VirtualViewport>
          <div v-else class="empty-files" role="row"><span role="gridcell">{{ $t('common.noData') }}</span></div>
        </div>
      </section>

      <details v-if="output" open class="output-area">
        <summary>{{ $t('commit.output') }}</summary>
        <pre role="status">{{ output }}</pre>
      </details>

      <footer class="commit-footer">
        <div class="footer-context">
          <span class="workspace-path" :title="workspaceStore.currentPath">{{ workspaceStore.currentPath }}</span>
          <span v-if="hiddenSelectedCount > 0" class="hidden-selection" role="status">
            {{ $t('commit.selectedCountWithHidden', { count: selectedFiles.length, hidden: hiddenSelectedCount }) }}
          </span>
        </div>
        <div class="footer-actions">
          <el-button size="small" :disabled="loading" @click="resetForm">{{ $t('common.reset') }}</el-button>
          <el-button type="primary" size="small" @click="doCommit" :loading="loading"
            :aria-label="$t(hasUnversionedSelection ? 'commit.addAndReview' : 'common.commit')"
            :disabled="!commitMessage || selectedFiles.length === 0 || workspaceStore.statusIsStale">
            <el-icon><Upload /></el-icon>{{ $t(hasUnversionedSelection ? 'commit.addAndReview' : 'common.commit') }}
          </el-button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import { svnAdd, svnCommit } from '@/api/svn'
import { useI18n } from 'vue-i18n'
import { getStatusClass, getStatusLabelKey } from '@/composables/useSvnStatus'
import { useWorkspace } from '@/composables/useWorkspace'
import { useSettings } from '@/composables/useSettings'
import type { SvnStatus } from '@/types'
import VirtualViewport from '@/components/VirtualViewport.vue'
import FileTypeIcon from '@/components/FileTypeIcon.vue'
import { buildChangeTree, filterChangeTree, flattenChangeTree, isWithinDirectory, normalizePath, type ChangeNode } from '@/utils/changeTree'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const workspaceStore = useWorkspaceStore()
const { openWorkspace: openWorkspaceDialog, refreshStatusAfterMutation } = useWorkspace()

const RECENT_COMMIT_MESSAGES_KEY = 'orcasvn-recent-commit-messages'
interface RecentCommitMessage {
  id: string
  message: string
}

interface CommitDraft { message: string; files: string[]; search: string; filter: 'all' | 'committable' | 'unversioned'; scroll?: number; collapsed?: string[]; activeRow?: string }
const drafts = workspaceStore.commitDrafts
const selectedFiles = ref<string[]>([])
const commitMessage = ref('')
const loading = ref(false)
const output = ref('')
const recentMessages = ref<RecentCommitMessage[]>([])

const committableStatuses = new Set(['added', 'modified', 'deleted', 'replaced', 'unversioned'])

const searchQuery = ref('')
const filterMode = ref<'all' | 'committable' | 'unversioned'>('all')
const fileViewport = ref<InstanceType<typeof VirtualViewport> | null>(null)
const collapsedPaths = ref(new Set<string>())
const activeRowPath = ref('')
const selectionAnchorPath = ref('')
const tableScrollLeft = ref(0)
const fileFilters = [
  { value: 'all', label: 'common.all' },
  { value: 'committable', label: 'commit.committable' },
  { value: 'unversioned', label: 'status.unversioned' },
] as const
const workspaceName = computed(() => normalizePath(workspaceStore.currentPath || '').split('/').pop())
const parentLocation = (path: string) => {
  const normalized = normalizePath(path)
  const separator = normalized.lastIndexOf('/')
  return separator < 0 ? '.' : normalized.slice(0, separator)
}
const displayStatus = (entry: SvnStatus) => entry.prop_status === 'modified'
  && ['normal', 'none', ''].includes(entry.status_code) ? 'modified' : entry.status_code
const statusSymbol = (entry: SvnStatus) => ({
  modified: 'M', added: 'A', deleted: 'D', replaced: 'R', unversioned: '?', missing: '!',
}[displayStatus(entry)] || '·')

const scope = computed(() => typeof route.query.directory === 'string' ? route.query.directory : '')
const allChangedFiles = computed(() => {
  return workspaceStore.statusList.filter(
    s => isWithinDirectory(s.path, scope.value) && s.status_code !== 'conflicted' && s.prop_status !== 'conflicted' && (committableStatuses.has(s.status_code) || s.prop_status === 'modified')
  )
})

const changedFiles = computed(() => {
  let files = allChangedFiles.value

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    files = files.filter(f => f.path.toLowerCase().includes(q))
  }

  if (filterMode.value === 'committable') {
    files = files.filter(f => f.status_code !== 'unversioned')
  } else if (filterMode.value === 'unversioned') {
    files = files.filter(f => f.status_code === 'unversioned')
  }

  return files
})

// Build and sort once per status/scope change, independently of search input.
const fullTree = computed(() => {
  const roots = buildChangeTree(allChangedFiles.value, scope.value)
  return roots.length === 1 && !roots[0].entry ? roots[0].children : roots
})
const treeData = computed(() => searchQuery.value || filterMode.value !== 'all'
  ? filterChangeTree(fullTree.value, visiblePaths.value) : fullTree.value)
const flatRows = computed(() => flattenChangeTree(treeData.value, collapsedPaths.value))
const toggleExpanded = (path: string) => {
  const next = new Set(collapsedPaths.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsedPaths.value = next
}
const focusRow = async (index: number) => {
  const target = Math.max(0, Math.min(index, flatRows.value.length - 1))
  const row = flatRows.value[target]
  if (!row) return
  activeRowPath.value = row.node.path
  fileViewport.value?.scrollToIndex(target)
  await nextTick()
  fileViewport.value?.element?.querySelector<HTMLElement>(`[data-row-index="${target}"]`)?.focus()
}
const handleRowKey = (event: KeyboardEvent, index: number) => {
  const row = flatRows.value[index]
  if (event.key === 'ArrowDown') { event.preventDefault(); void focusRow(index + 1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); void focusRow(index - 1) }
  else if (event.key === 'Home') { event.preventDefault(); void focusRow(0) }
  else if (event.key === 'End') { event.preventDefault(); void focusRow(flatRows.value.length - 1) }
  else if (row && event.key === 'ArrowRight') {
    event.preventDefault()
    if (row.node.children.length && collapsedPaths.value.has(row.node.path)) toggleExpanded(row.node.path)
    else if (row.node.children.length) void focusRow(index + 1)
  } else if (row && event.key === 'ArrowLeft') {
    event.preventDefault()
    if (row.node.children.length && !collapsedPaths.value.has(row.node.path)) toggleExpanded(row.node.path)
    else {
      let parent = index - 1
      while (parent >= 0 && flatRows.value[parent].depth >= row.depth) parent--
      if (parent >= 0) void focusRow(parent)
    }
  } else if (row && event.key === ' ' && event.target === event.currentTarget && !loading.value && !workspaceStore.statusIsStale) {
    event.preventDefault()
    toggleSelection(row.node, !isChecked(row.node), event.shiftKey)
  }
}
const selectedSet = computed(() => new Set(selectedFiles.value))
const isSubtreeChecked = (node: ChangeNode) => node.targets.every(path => selectedSet.value.has(path))
const isChecked = (node: ChangeNode) => node.entry ? selectedSet.value.has(node.entry.path) : isSubtreeChecked(node)
const isPartial = (node: ChangeNode) => !node.entry && !isChecked(node) && node.targets.some(path => selectedSet.value.has(path))
const toggleNode = (node: ChangeNode, checked: boolean) => {
  if (loading.value || workspaceStore.statusIsStale) return
  const selection = new Set(selectedFiles.value)
  const targets = node.entry ? [node.entry.path] : node.targets
  targets.forEach(path => checked ? selection.add(path) : selection.delete(path))
  selectedFiles.value = [...selection]
}
const toggleSelection = (node: ChangeNode, checked: boolean, range = false) => {
  if (loading.value || workspaceStore.statusIsStale) return
  const anchor = flatRows.value.findIndex(row => row.node.path === selectionAnchorPath.value)
  const target = flatRows.value.findIndex(row => row.node.path === node.path)
  if (range && anchor >= 0 && target >= 0) {
    const selection = new Set(selectedFiles.value)
    // Range selection follows visible rows, including offscreen virtual rows.
    // Synthetic folder headings must not select their hidden descendants.
    for (const row of flatRows.value.slice(Math.min(anchor, target), Math.max(anchor, target) + 1)) {
      if (row.node.entry) {
        const path = row.node.entry.path
        if (checked) selection.add(path)
        else selection.delete(path)
      }
    }
    selectedFiles.value = [...selection]
  } else {
    toggleNode(node, checked)
    selectionAnchorPath.value = node.path
  }
}
watch([() => workspaceStore.currentPath, scope, searchQuery, filterMode], () => { selectionAnchorPath.value = '' }, { flush: 'sync' })
const toggleSubtree = (node: ChangeNode, checked: boolean) => {
  if (loading.value || workspaceStore.statusIsStale) return
  const selection = new Set(selectedFiles.value)
  node.targets.forEach(path => checked ? selection.add(path) : selection.delete(path))
  selectedFiles.value = [...selection]
}
const handleRowClick = (event: MouseEvent, node: ChangeNode) => {
  if (loading.value || workspaceStore.statusIsStale) return
  if (event.target instanceof Element && event.target.closest('input, button, a, label')) return
  toggleSelection(node, !isChecked(node), event.shiftKey)
  const element = event.currentTarget as HTMLElement
  element.focus({ preventScroll: true })
}
const visiblePaths = computed(() => new Set(changedFiles.value.map(file => file.path)))
const hiddenSelectedCount = computed(() => selectedFiles.value.filter(path => !visiblePaths.value.has(path)).length)
const allSelected = computed(() => allChangedFiles.value.length > 0
  && allChangedFiles.value.every(file => selectedSet.value.has(file.path)))
const toggleAll = (checked: boolean) => {
  selectionAnchorPath.value = ''
  selectedFiles.value = checked ? allChangedFiles.value.map(file => file.path) : []
}
const setScope = (directory: string) => {
  router.replace({ name: 'commit', query: directory ? { directory } : {} })
}
const hasUnversionedSelection = computed(() => allChangedFiles.value.some(file =>
  file.status_code === 'unversioned' && selectedSet.value.has(file.path)))

const routeSelectedFiles = computed(() => {
  const files = route.query.files
  if (Array.isArray(files)) {
    return files.filter((file): file is string => typeof file === 'string')
  }
  return typeof files === 'string' ? [files] : []
})

const applyRouteSelection = () => {
  const requested = new Set(routeSelectedFiles.value)
  if (!scope.value && requested.size === 0) return
  selectedFiles.value = allChangedFiles.value
    .filter(file => scope.value ? file.status_code !== 'unversioned' : requested.has(file.path))
    .map(file => file.path)
}
watch([scope, () => route.query.files], applyRouteSelection, { immediate: true })
watch(allChangedFiles, () => {
  if (workspaceStore.statusIsStale) return
  const available = new Set(allChangedFiles.value.map(file => file.path))
  selectedFiles.value = selectedFiles.value.filter(path => available.has(path))
})
const saveDraft = (path = workspaceStore.currentPath) => {
  if (path) drafts[path] = { message: commitMessage.value, files: [...selectedFiles.value], search: searchQuery.value, filter: filterMode.value, scroll: fileViewport.value?.element?.scrollTop || 0, collapsed: [...collapsedPaths.value], activeRow: activeRowPath.value }
}
let pendingDraftScroll: number | null = null
const restoreDraftScroll = async (path: string | null) => {
  await nextTick()
  if (workspaceStore.currentPath !== path || workspaceStore.statusIsStale || pendingDraftScroll === null || !fileViewport.value?.element) return
  fileViewport.value.element.scrollTop = pendingDraftScroll
  pendingDraftScroll = null
}
watch(() => workspaceStore.statusIsStale, stale => { if (!stale) void restoreDraftScroll(workspaceStore.currentPath) })
const restoreDraft = (path: string | null) => {
  const draft: CommitDraft | undefined = path ? drafts[path] : undefined
  selectedFiles.value = draft?.files || []
  commitMessage.value = draft?.message || ''
  searchQuery.value = draft?.search || ''
  filterMode.value = draft?.filter || 'all'
  collapsedPaths.value = new Set(draft?.collapsed || [])
  activeRowPath.value = draft?.activeRow || ''
  pendingDraftScroll = draft?.scroll || 0
  void restoreDraftScroll(path)
  output.value = ''
}
watch(() => workspaceStore.currentPath, (path, previousPath) => {
  saveDraft(previousPath)
  restoreDraft(path)
  recentMessages.value = []
  sessionStorage.removeItem('orca_commit_form')
  void loadRecentMessages()
}, { flush: 'sync' })
onBeforeUnmount(() => saveDraft())

onMounted(() => {
  restoreDraft(workspaceStore.currentPath)
  if (scope.value || routeSelectedFiles.value.length) applyRouteSelection()
  const saved = sessionStorage.getItem('orca_commit_form')
  if (saved) {
    try {
      const data = JSON.parse(saved)
      if (data.workspace === workspaceStore.currentPath && data.scope === scope.value) {
        const available = new Set(allChangedFiles.value.map(file => file.path))
        selectedFiles.value = Array.isArray(data.selectedFiles)
          ? data.selectedFiles.filter((path: string) => available.has(path)) : []
        commitMessage.value = typeof data.commitMessage === 'string' ? data.commitMessage : ''
      }
    } catch { /* ignore invalid saved state */ }
    sessionStorage.removeItem('orca_commit_form')
  }
  void loadRecentMessages()
})
onBeforeRouteLeave((to) => {
  if (loading.value) return false
  saveDraft()
  if (to.name !== 'diff') sessionStorage.removeItem('orca_commit_form')
})

const openWorkspace = async () => {
  const success = await openWorkspaceDialog(t('dialog.selectSVNWorkspaceDirectory'))
  if (success) {
    router.push({ name: 'workspace' })
  }
}

const doCommit = async () => {
  if (!workspaceStore.currentPath || workspaceStore.operationBusy || workspaceStore.statusIsStale || !commitMessage.value || selectedFiles.value.length === 0) {
    return
  }

  loading.value = true
  const committedPath = workspaceStore.currentPath
  workspaceStore.setOperationBusy(true)
  output.value = ''

  try {
    const availablePaths = new Set(allChangedFiles.value.map(file => file.path))
    const files = selectedFiles.value.filter(path => availablePaths.has(path))
    if (files.length === 0) return

    const { settings } = useSettings()
    const filterRules = settings.gitignoreEnabled ? settings.filterRules.split('\n') : []
    const targetFileSet = new Set(files)
    const unversionedFiles = allChangedFiles.value
      .filter(file => file.status_code === 'unversioned' && targetFileSet.has(file.path))
      .map(file => file.path)

    if (unversionedFiles.length > 0) {
      await svnAdd(workspaceStore.currentPath, unversionedFiles, filterRules)
      await refreshStatusAfterMutation()
      selectedFiles.value = allChangedFiles.value
        .filter(file => targetFileSet.has(file.path) || unversionedFiles.some(parent => isWithinDirectory(file.path, parent)))
        .map(file => file.path)
      output.value = t('commit.reviewAdded')
      return
    }

    const result = await svnCommit(workspaceStore.currentPath, commitMessage.value, files, filterRules)
    if (result.success) recordRecentMessage(workspaceStore.currentPath, commitMessage.value)
    output.value = result.output
    await refreshStatusAfterMutation()

    setTimeout(() => {
      if (workspaceStore.currentPath === committedPath) router.push({ name: 'workspace' })
    }, 1500)
  } catch (err) {
    output.value = `${t('common.error')}：${err}`
  } finally {
    workspaceStore.setOperationBusy(false)
    loading.value = false
  }
}

const viewDiff = (path: string) => {
  const allFiles = allChangedFiles.value.map(f => f.path)
  const index = allFiles.indexOf(path)

  sessionStorage.setItem('orca_commit_form', JSON.stringify({
    workspace: workspaceStore.currentPath,
    scope: scope.value,
    selectedFiles: selectedFiles.value,
    commitMessage: commitMessage.value,
  }))
  sessionStorage.setItem('orca_diff_files', JSON.stringify({
    source: 'commit',
    files: allFiles,
    current: path,
    index: Math.max(0, index),
  }))

  router.push({ name: 'diff', query: { path } })
}

const resetForm = () => {
  selectionAnchorPath.value = ''
  selectedFiles.value = []
  commitMessage.value = ''
  output.value = ''

}

const loadRecentMessages = () => {
  const workspacePath = workspaceStore.currentPath
  if (!workspacePath) return

  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_COMMIT_MESSAGES_KEY) || '{}') as Record<string, unknown>
    const messages = stored[workspacePath]
    recentMessages.value = Array.isArray(messages)
      ? messages.filter((entry): entry is RecentCommitMessage => Boolean(entry && typeof entry === 'object' && typeof (entry as RecentCommitMessage).id === 'string' && typeof (entry as RecentCommitMessage).message === 'string'))
      : []
  } catch {
    recentMessages.value = []
  }
}

const recordRecentMessage = (workspacePath: string, message: string) => {
  const normalized = message.trim()
  if (!normalized) return

  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_COMMIT_MESSAGES_KEY) || '{}') as Record<string, unknown>
    const previous = Array.isArray(stored[workspacePath])
      ? stored[workspacePath] as RecentCommitMessage[]
      : []
    stored[workspacePath] = [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message: normalized },
      ...previous.filter(entry => entry.message !== normalized),
    ]
    localStorage.setItem(RECENT_COMMIT_MESSAGES_KEY, JSON.stringify(stored))
    recentMessages.value = stored[workspacePath] as RecentCommitMessage[]
  } catch {
    // Ignore unavailable or malformed local storage.
  }
}

const useRecentMessage = (message: string) => {
  commitMessage.value = message
}
</script>

<style scoped>
.commit-view.compact-commit {
  --commit-text: #1c2938;
  --commit-muted: #4d5c6c;
  --commit-directory-context: #84909d;
  --commit-border: #b8c5d2;
  --commit-toolbar: #e9eef4;
  --commit-heading: #e0e8f0;
  --commit-stripe: #f4f7fa;
  --commit-hover: #e7f0fa;
  --commit-selected: #dcecff;
  --commit-selected-hover: #cce3fc;
  --commit-accent: #125b96;
  color: var(--commit-text);
  height: 100%;
  min-width: 0;
  overflow: hidden;
  flex-direction: column;
  background: var(--el-bg-color);
}

/* Keep the higher contrast palette local to the commit page. */
:global(html.theme-dark .commit-view.compact-commit) {
  --commit-text: #e7eef6;
  --commit-muted: #b5c3d1;
  --commit-directory-context: #8e9dac;
  --commit-border: #536779;
  --commit-toolbar: #233341;
  --commit-heading: #2c4052;
  --commit-stripe: #1c2a36;
  --commit-hover: #2a3e50;
  --commit-selected: #244969;
  --commit-selected-hover: #2b557b;
  --commit-accent: #a3d3ff;
}

.no-workspace { display: grid; place-items: center; flex: 1; }
.commit-content { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
.commit-warning { flex-shrink: 0; border-radius: 0; }
.message-panel { flex-shrink: 0; border-bottom: 1px solid var(--commit-border); }
.section-toolbar { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 14px; background: var(--commit-toolbar); }
.section-toolbar h2 { margin: 0; color: var(--commit-text); font-size: 12px; font-weight: 600; white-space: nowrap; }
.character-count { margin-left: auto; color: var(--commit-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.section-toolbar :deep(.el-button) { height: 28px; min-height: 28px; padding: 0 6px; font-size: 12px; font-weight: 400; }
.recent-arrow { margin-left: 6px; }
.recent-message-text { display: block; max-width: min(420px, 65vw); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.commit-textarea :deep(.el-textarea__inner) { min-height: 100px; padding: 10px 14px; border-radius: 0; box-shadow: none; background: var(--el-bg-color); color: var(--commit-text); font-size: 13px; line-height: 1.55; }
.commit-textarea :deep(.el-textarea__inner::placeholder) { color: var(--commit-muted); }
.search-input :deep(.el-input__inner::placeholder) { color: var(--commit-muted); }
.commit-textarea :deep(.el-textarea__inner:focus) { box-shadow: inset 3px 0 var(--el-color-primary); }
.changes-panel { min-width: 0; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.changes-toolbar { min-height: 42px; flex-wrap: wrap; padding-top: 4px; padding-bottom: 4px; border-bottom: 1px solid var(--commit-border); }
.selection-count { color: var(--el-text-color-primary); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.selection-count span { color: var(--commit-muted); font-weight: 400; }
.search-input :deep(.el-input__wrapper) { min-height: 28px; height: 28px; border-radius: 5px; }
.search-input { width: 210px; max-width: 40%; margin-left: auto; }
.filter-buttons { display: flex; gap: 2px; padding: 2px; border: 1px solid var(--commit-border); border-radius: 5px; background: var(--el-bg-color); }
.filter-buttons button { min-height: 23px; padding: 0 9px; border: 0; border-radius: 3px; background: transparent; color: var(--commit-text); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
.filter-buttons button.active { color: var(--md-sys-color-on-primary); background: var(--el-color-primary); font-weight: 600; }
.filter-buttons button:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
.filter-buttons button:disabled { opacity: .5; cursor: default; }
.scope-bar { display: flex; align-items: center; flex-shrink: 0; gap: 8px; padding: 4px 14px; color: var(--commit-muted); font-size: 12px; border-bottom: 1px solid var(--commit-border); }
.scope-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scope-bar .el-button { margin-left: auto; }
.file-table-container { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; font-size: 12px; }
.file-table-heading { flex-shrink: 0; overflow: hidden; border-bottom: 1px solid var(--commit-border); background: var(--commit-heading); color: var(--commit-text); font-weight: 600; }
.commit-columns { display: grid; grid-template-columns: 42px minmax(230px, 1.2fr) 76px minmax(200px, 1fr) 60px; align-items: center; min-width: 640px; }
.file-table-heading .commit-columns { height: 30px; }
.commit-columns > [role="columnheader"], .commit-columns > [role="gridcell"] { min-width: 0; padding: 0 8px; }
.commit-files { background: var(--el-bg-color); }
.commit-file-row { user-select: none; height: 29px; color: var(--commit-text); cursor: pointer; }
.commit-file-row.striped { background: var(--commit-stripe); }
.commit-file-row:hover { background: var(--commit-hover); }
.commit-file-row.selected { background: var(--commit-selected); box-shadow: inset 3px 0 var(--commit-accent); }
.commit-file-row.selected:hover { background: var(--commit-selected-hover); }
.commit-file-row:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
.commit-columns > .checkbox-cell { display: flex; align-items: center; justify-content: center; }
.commit-checkbox { width: 14px; height: 14px; margin: 0; accent-color: var(--el-color-primary); cursor: pointer; }
.commit-checkbox:disabled { cursor: default; }
.name-cell { display: flex; align-items: center; gap: 6px; overflow: hidden; }
.expand-button, .expand-spacer { flex: 0 0 16px; width: 16px; height: 22px; }
.expand-button { display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--commit-muted); cursor: pointer; }
.expand-button:hover { color: var(--el-color-primary); background: var(--el-fill-color); }
.expand-button:focus-visible, .diff-link:focus-visible, .subtree-select-button:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 1px; }
.tree-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.directory-name { color: var(--commit-text); font-weight: 500; }
.context-directory-name { color: var(--commit-directory-context); font-weight: 400; }
.tree-count { flex-shrink: 0; margin-left: 2px; color: var(--commit-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.status-cell { display: flex; align-items: center; justify-content: center; }
.file-location { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--commit-muted); font-size: 12px; }
.diff-cell { text-align: center; }
.subtree-select-button { flex-shrink: 0; padding: 2px 4px; border: 0; border-radius: 3px; background: transparent; color: var(--el-color-primary); font: inherit; font-size: 11px; cursor: pointer; }
.subtree-select-button:hover { text-decoration: underline; }
.subtree-select-button:disabled { opacity: .5; cursor: default; }
.diff-link { padding: 2px 4px; border: 0; border-radius: 3px; background: transparent; color: var(--commit-accent); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
.diff-link:hover { color: var(--el-color-primary); text-decoration: underline; }
.diff-link:disabled { opacity: .5; cursor: default; }
.empty-files { display: grid; flex: 1; place-items: center; min-height: 80px; color: var(--commit-muted); }
.status-badge { min-height: 19px; display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 19px; padding: 0 4px; border-radius: 3px; font: 600 11px/1 var(--app-font-family-mono); }
.output-area { flex-shrink: 0; border-top: 1px solid var(--commit-border); font-size: 12px; }
.output-area summary { padding: 5px 14px; cursor: pointer; background: var(--commit-toolbar); color: var(--commit-text); }
.output-area pre { max-height: 100px; overflow: auto; margin: 0; padding: 8px 14px; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 var(--app-font-family-mono); }
.commit-footer { display: flex; align-items: center; flex-shrink: 0; gap: 14px; min-height: 52px; padding: 8px 14px; border-top: 1px solid var(--commit-border); background: var(--el-bg-color); }
.footer-context { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; font-size: 11px; }
.workspace-path { color: var(--commit-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hidden-selection { color: var(--el-color-warning); overflow-wrap: anywhere; }
.footer-actions { display: flex; align-items: center; flex-shrink: 0; gap: 8px; }
.footer-actions .el-button { height: 30px; min-height: 30px; margin-left: 0; padding: 0 12px; font-size: 12px; }
.footer-actions .el-button:not(.el-button--primary) { background: var(--md-sys-color-surface-container-lowest); color: var(--md-sys-color-on-surface); border-color: var(--md-sys-color-outline); }
.footer-actions .el-icon { margin-right: 5px; }

@media (max-width: 860px) {
  .changes-toolbar { gap: 6px; }
  .search-input { width: 150px; }
  .filter-buttons button { padding: 0 6px; }
}
@media (max-height: 650px) {
  .commit-textarea :deep(.el-textarea__inner) { height: 76px; min-height: 76px; }
  .section-toolbar { min-height: 30px; }
  .commit-footer { min-height: 44px; padding-top: 5px; padding-bottom: 5px; }
}
</style>
