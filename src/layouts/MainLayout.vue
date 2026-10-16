<template>
  <div class="fork-shell">
    <header class="fork-toolbar">
      <div class="toolbar-brand">
        <button class="brand-button" aria-label="OrcaSVN" :disabled="workspaceStore.operationBusy" @click="navigateTo('workspace')">
          <span class="brand-mark">
            <svg viewBox="0 0 512 512" aria-hidden="true">
              <path d="M91 297C132 217 214 170 345 166C322 187 309 211 306 237C347 241 385 258 420 289C358 288 315 305 288 340C221 361 155 347 91 297Z" />
              <path d="M153 288C188 238 233 209 290 201C270 232 269 263 286 294C235 310 191 308 153 288Z" class="brand-cut" />
              <path d="M326 207V143M326 143L374 114M326 143L281 112" class="brand-branch" />
              <circle cx="326" cy="207" r="18" class="brand-node" />
              <circle cx="374" cy="114" r="18" class="brand-node" />
              <circle cx="281" cy="112" r="18" class="brand-node" />
            </svg>
          </span>
          <span class="brand-name">OrcaSVN</span>
        </button>
      </div>
      <nav class="toolbar-actions" :aria-label="$t('workspace.application')">
        <button class="tool-button" :class="{ active: routeName === 'workspace' }" :aria-current="routeName === 'workspace' ? 'page' : undefined" :title="$t('menu.workspace')" :disabled="workspaceStore.operationBusy" @click="navigateTo('workspace')">
          <el-icon><FolderOpened /></el-icon><span>{{ $t('menu.workspace') }}</span>
        </button>
        <button class="tool-button" :class="{ active: routeName === 'log' }" :aria-current="routeName === 'log' ? 'page' : undefined" :title="$t('menu.log')" :disabled="workspaceStore.operationBusy" @click="navigateTo('log')">
          <el-icon><List /></el-icon><span>{{ $t('menu.log') }}</span>
        </button>
        <button class="tool-button" :class="{ active: routeName === 'diff' }" :aria-current="routeName === 'diff' ? 'page' : undefined" :title="$t('menu.diff')" :disabled="workspaceStore.operationBusy" @click="navigateTo('diff')">
          <el-icon><Connection /></el-icon><span>{{ $t('menu.diff') }}</span>
        </button>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <button class="tool-button" :class="{ active: routeName === 'update' }" :aria-current="routeName === 'update' ? 'page' : undefined" :title="$t('menu.update')" :disabled="workspaceStore.operationBusy" @click="navigateTo('update')">
          <el-icon><RefreshRight /></el-icon><span>{{ $t('menu.update') }}</span>
        </button>
        <button class="tool-button" :class="{ active: routeName === 'commit' }" :aria-current="routeName === 'commit' ? 'page' : undefined" :title="$t('menu.commit')" :disabled="workspaceStore.operationBusy" @click="navigateTo('commit')">
          <el-icon><Upload /></el-icon><span>{{ $t('menu.commit') }}</span>
        </button>
        <button class="tool-button" :class="{ active: routeName === 'stash' }" :aria-current="routeName === 'stash' ? 'page' : undefined" :title="$t('menu.stash')" :disabled="workspaceStore.operationBusy" @click="navigateTo('stash')">
          <el-icon><Archive /></el-icon><span>{{ $t('menu.stash') }}</span>
        </button>
        <button class="tool-button" :class="{ active: routeName === 'blame' }" :aria-current="routeName === 'blame' ? 'page' : undefined" :title="$t('menu.blame')" :disabled="workspaceStore.operationBusy" @click="navigateTo('blame')">
          <el-icon><Edit /></el-icon><span>{{ $t('menu.blame') }}</span>
        </button>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <button class="tool-button" :class="{ active: routeName === 'checkout' }" :aria-current="routeName === 'checkout' ? 'page' : undefined" :title="$t('menu.checkout')" :disabled="workspaceStore.operationBusy" @click="navigateTo('checkout')">
          <el-icon><Download /></el-icon><span>{{ $t('menu.checkout') }}</span>
        </button>
        <button
          class="tool-button"
          :class="{ 'is-refreshing': workspaceStore.isLoading }"
          :aria-busy="workspaceStore.isLoading"
          :aria-label="$t('menu.refresh')"
          :title="$t('menu.refresh')"
          @click="refreshStatus"
          :disabled="workspaceStore.isLoading"
        >
          <el-icon><Refresh /></el-icon>
          <span>{{ $t('menu.refresh') }}</span>
        </button>
        <el-dropdown
          trigger="click"
          popper-class="toolbar-dropdown"
          :disabled="!workspaceStore.currentPath"
          @command="openCurrentWorkspaceIn"
        >
          <button
            class="open-in-trigger"
            :disabled="!workspaceStore.currentPath"
            :aria-label="$t('menu.openIn')"
            :title="$t('menu.openIn')"
          >
            <el-icon class="open-in-app-icon"><OpenIn /></el-icon>
            <span class="open-in-label">{{ $t('menu.openIn') }}</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="explorer" :class="{ 'is-current-target': selectedOpenTarget === 'explorer' }">
                <el-icon><component :is="openTargetIcons.explorer" /></el-icon>
                {{ $t('openIn.explorer') }}
              </el-dropdown-item>
              <el-dropdown-item command="vscode" :class="{ 'is-current-target': selectedOpenTarget === 'vscode' }">
                <el-icon><component :is="openTargetIcons.vscode" /></el-icon>
                {{ $t('openIn.vscode') }}
              </el-dropdown-item>
              <el-dropdown-item command="terminal" :class="{ 'is-current-target': selectedOpenTarget === 'terminal' }">
                <el-icon><component :is="openTargetIcons.terminal" /></el-icon>
                {{ $t('openIn.terminal') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </nav>
      <div class="toolbar-group toolbar-group-right">
        <button class="tool-button" :class="{ active: routeName === 'settings' }" :title="$t('menu.settings')" :disabled="workspaceStore.operationBusy" @click="navigateTo('settings')">
          <el-icon><Setting /></el-icon><span>{{ $t('menu.settings') }}</span>
        </button>
        <LanguageSwitcher />
      </div>
    </header>

    <main class="fork-content">
      <aside class="shell-sidebar" :aria-label="$t('workspace.projects')" :style="{ width: `${sidebarWidth}px` }">
        <div class="project-heading"><strong>{{ $t('workspace.projects') }}</strong><span>{{ workspaceStore.recentWorkspaces.length }}</span></div>
        <div class="project-list">
          <el-dropdown v-for="path in workspaceStore.recentWorkspaces" :key="path" trigger="contextmenu" @command="handleProjectCommand(path, $event)">
            <button class="project-item" :class="{ active: path === workspaceStore.currentPath }" :aria-pressed="path === workspaceStore.currentPath" :title="projectTitle(path)" :disabled="workspaceStore.operationBusy" draggable="true" @dragstart="draggedProject = path" @dragend="draggedProject = null" @dragover.prevent @drop.prevent="dropProject(path)" @click="switchProject(path)">
              <el-icon><Folder /></el-icon>
              <span class="project-copy"><strong>{{ workspaceNameFromPath(path) }}</strong><small>{{ path }}</small></span>
              <span v-if="workspaceStore.projectSummaries[path]" class="project-count" :title="$t('workspace.lastScanned')">{{ workspaceStore.projectSummaries[path].count }}</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="open">{{ $t('openIn.explorer') }}</el-dropdown-item>
                <el-dropdown-item command="copy">{{ $t('workspace.copyPath') }}</el-dropdown-item>
                <el-dropdown-item command="up">{{ $t('workspace.moveUp') }}</el-dropdown-item>
                <el-dropdown-item command="down">{{ $t('workspace.moveDown') }}</el-dropdown-item>
                <el-dropdown-item divided command="remove" :disabled="workspaceStore.operationBusy || workspaceStore.isLoading">{{ $t('workspace.removeWorkspace') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <p v-if="!workspaceStore.recentWorkspaces.length" class="project-empty">{{ $t('workspace.noWorkspace') }}</p>
        </div>
        <button class="project-add" :disabled="workspaceStore.operationBusy" @click="addProject"><el-icon><Plus /></el-icon><span>{{ $t('workspace.addWorkingCopy') }}</span></button>
        <div class="sidebar-resizer" role="separator" aria-orientation="vertical" :aria-label="$t('workspace.resizeProjects')" :aria-valuenow="sidebarWidth" :aria-valuemin="200" :aria-valuemax="360" tabindex="0" @pointerdown="startSidebarResize" @keydown.left.prevent="resizeSidebar(sidebarWidth - 8)" @keydown.right.prevent="resizeSidebar(sidebarWidth + 8)"></div>
      </aside>

      <section class="route-workbench">
        <header class="route-header">
          <div class="route-title">
            <span class="route-accent"></span>
            <strong :title="repositoryName">{{ repositoryName }}</strong>
            <span class="route-page">/ {{ currentRouteTitle }}</span>
          </div>
          <span class="route-repository">{{ workspaceStore.operationBusy ? $t('workspace.operationRunning') : repositoryRevision }}</span>
        </header>
        <div class="route-content">
          <router-view v-slot="{ Component, route }">
            <keep-alive :include="cachedViews">
              <component :is="Component" :key="route.path" />
            </keep-alive>
          </router-view>
        </div>
      </section>
    </main>

    <footer class="fork-status">
      <span>{{ workspaceStore.currentPath || $t('workspace.noWorkspace') }}</span>
      <div>
        <span v-if="workspaceStore.hasChanges">{{ $t('workspace.changeCount', { count: workspaceStore.statusList.length }) }}</span>
        <span v-if="workspaceStore.svnInfo">r{{ workspaceStore.svnInfo.revision }}</span>
        <button
          v-if="updateState === 'available'"
          type="button"
          class="version-update"
          :title="$t('appUpdate.viewRelease')"
          @click="openReleasePage"
        >
          v{{ appVersion }}
          <span class="update-dot" aria-hidden="true"></span>
          {{ $t('appUpdate.available', { version: latestVersion }) }}
        </button>
        <span v-else>v{{ appVersion }}</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus/es/components/message/index'
import { launchWorkspacePath, openWorkspaceTarget, type OpenWorkspaceTarget } from '@/api/svn'
import { useWorkspaceStore } from '@/stores/workspace'
import { writeClipboardText } from '@/utils/clipboard'
import { useWorkspace } from '@/composables/useWorkspace'
import { useUpdateCheck } from '@/composables/useUpdateCheck'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import {
  Archive,
  Code,
  OpenIn,
  FolderOpened as FolderOpenedIcon,
  Terminal,
} from '@/components/icons/materialIcons'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { loadWorkspace, openWorkspace, refreshStatus, refreshStatusIfStale, restoreLastWorkspace } = useWorkspace()
const {
  currentVersion: appVersion,
  state: updateState,
  latestVersion,
  checkForUpdates,
  openReleasePage,
} = useUpdateCheck()
const cachedViews = ref(['WorkspaceView', 'LogView', 'UpdateView'])
const statusRefreshIntervalMs = 60_000
let statusRefreshTimer: number | undefined
const selectedOpenTarget = ref<OpenWorkspaceTarget>('explorer')
const openTargetIcons = {
  explorer: FolderOpenedIcon,
  vscode: Code,
  terminal: Terminal,
} satisfies Record<OpenWorkspaceTarget, typeof FolderOpenedIcon>

const repositoryName = computed(() => {
  const path = workspaceStore.currentPath
  if (!path) return t('workspace.welcomeRepository')
  return path.split(/[\\/]/).filter(Boolean).pop() || path
})

const workspaceNameFromPath = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path

const repositoryRevision = computed(() => workspaceStore.svnInfo ? `r${workspaceStore.svnInfo.revision}` : 'OrcaSVN')

const routeName = computed(() => String(route.name || 'workspace'))
const currentRouteTitle = computed(() => {
  const titleKey = route.meta.title
  return t(typeof titleKey === 'string' ? titleKey : 'menu.workspace')
})

const navigateTo = (name: string) => {
  if (!workspaceStore.operationBusy) return router.push({ name })
}

const switchProject = async (path: string) => {
  if (workspaceStore.operationBusy || path === workspaceStore.currentPath) return
  // Each project opens in its workspace, without the previous project's query.
  const request = loadWorkspace(path)
  await router.replace({ name: 'workspace' })
  if (!(await request) && workspaceStore.error) ElMessage.error(workspaceStore.error)
}

const addProject = async () => {
  if (workspaceStore.operationBusy) return
  if (await openWorkspace(t('workspace.selectWorkspaceTitle'))) await router.push({ name: 'workspace' })
}

const projectTitle = (path: string) => {
  const summary = workspaceStore.projectSummaries[path]
  return summary ? `${path}\n${t('workspace.lastScanned')}: ${new Date(summary.scannedAt).toLocaleString()}` : path
}
const draggedProject = ref<string | null>(null)
const dropProject = (target: string) => {
  if (draggedProject.value) workspaceStore.moveProject(draggedProject.value, target)
  draggedProject.value = null
}
const handleProjectCommand = async (path: string, command: string) => {
  try {
    if (command === 'open') await openWorkspaceTarget(path, 'explorer')
    if (command === 'copy') await writeClipboardText(path)
    if (command === 'up' || command === 'down') {
      const index = workspaceStore.recentWorkspaces.indexOf(path)
      const target = workspaceStore.recentWorkspaces[index + (command === 'up' ? -1 : 1)]
      if (target) workspaceStore.moveProject(path, target)
    }
    if (command === 'remove' && !workspaceStore.operationBusy && !workspaceStore.isLoading) {
      const active = path === workspaceStore.currentPath
      workspaceStore.removeRecentWorkspace(path)
      if (active && workspaceStore.recentWorkspaces[0]) await switchProject(workspaceStore.recentWorkspaces[0])
    }
  } catch (err) { ElMessage.error(`${t('common.error')}：${err}`) }
}

const SIDEBAR_WIDTH_KEY = 'orcasvn-project-sidebar-width'
const sidebarWidth = ref(Math.max(200, Math.min(360, Number(localStorage.getItem(SIDEBAR_WIDTH_KEY)) || 240)))
const resizeSidebar = (width: number) => {
  sidebarWidth.value = Math.max(200, Math.min(360, width))
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value))
}
const startSidebarResize = (event: PointerEvent) => {
  if (event.button !== 0) return
  const handle = event.currentTarget as HTMLElement
  const startX = event.clientX, startWidth = sidebarWidth.value
  handle.setPointerCapture(event.pointerId)
  const move = (next: PointerEvent) => resizeSidebar(startWidth + next.clientX - startX)
  const stop = () => {
    handle.removeEventListener('pointermove', move)
    handle.removeEventListener('pointerup', stop)
    handle.removeEventListener('lostpointercapture', stop)
  }
  handle.addEventListener('pointermove', move)
  handle.addEventListener('pointerup', stop)
  handle.addEventListener('lostpointercapture', stop)
}

const openCurrentWorkspaceIn = async (target: OpenWorkspaceTarget) => {
  if (!workspaceStore.currentPath) return

  try {
    await openWorkspaceTarget(workspaceStore.currentPath, target)
    selectedOpenTarget.value = target
  } catch (err) {
    ElMessage.error(`${t('common.error')}：${err}`)
  }
}

const refreshStatusSilently = async () => {
  if (!workspaceStore.currentPath || workspaceStore.isLoading) return
  await refreshStatusIfStale(statusRefreshIntervalMs)
}

onMounted(async () => {
  void checkForUpdates()
  const launchPath = await launchWorkspacePath().catch(() => null)
  if (!launchPath || !(await loadWorkspace(launchPath))) {
    await restoreLastWorkspace()
  }
  statusRefreshTimer = window.setInterval(refreshStatusSilently, statusRefreshIntervalMs)
})

onUnmounted(() => {
  if (statusRefreshTimer !== undefined) {
    window.clearInterval(statusRefreshTimer)
  }
})
</script>

<style scoped>
.fork-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) var(--app-size-statusbar);
  height: 100vh;
  overflow: hidden;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface);
}

.fork-toolbar {
  position: relative;
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(0, auto) minmax(170px, 1fr);
  align-items: center;
  gap: 16px;
  min-height: var(--app-size-toolbar);
  padding: 10px 18px;
  background: var(--md-sys-color-surface-container-lowest);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  box-shadow: none;
}

.toolbar-group {
  align-items: center;
  display: flex;
  min-width: 0;
  gap: 16px;
}

.toolbar-group-right {
  justify-content: flex-end;
}

.toolbar-brand { display: flex; align-items: center; }
.toolbar-actions { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; min-width: 0; }

.brand-button {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 112px;
  padding: 0 10px 0 0;
  border: 0;
  border-radius: var(--app-radius-full);
  color: var(--md-sys-color-on-surface);
  background: transparent;
  cursor: pointer;
  transition:
    color var(--app-transition-fast),
    background-color var(--app-transition-fast);
}

.brand-button:hover {
  background: var(--md-sys-state-hover);
}

.brand-mark {
  display: grid;
  place-items: center;
  width: var(--app-size-control-compact);
  height: var(--app-size-control-compact);
  border-radius: 11px;
  color: var(--md-sys-color-on-primary);
  background: var(--md-sys-color-primary);
  box-shadow: none;
}

.brand-mark svg {
  width: var(--app-size-icon-lg);
  fill: currentColor;
}

.brand-mark .brand-cut {
  fill: var(--md-sys-color-primary-active);
}

.brand-mark .brand-branch {
  fill: none;
  stroke: #73d6c9;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 20px;
}

.brand-mark .brand-node {
  fill: #fff;
  stroke: #73d6c9;
  stroke-width: 13px;
}

.brand-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -.01em;
}

:global(.theme-dark .fork-toolbar .brand-button),
:global(.dark .fork-toolbar .brand-button),
:global(.theme-dark .fork-toolbar .brand-button .brand-name),
:global(.dark .fork-toolbar .brand-button .brand-name) {
  color: var(--md-sys-color-on-surface) !important;
}

:global(.theme-dark .fork-toolbar .brand-button:hover),
:global(.dark .fork-toolbar .brand-button:hover),
:global(.theme-dark .fork-toolbar .brand-button:focus-visible),
:global(.dark .fork-toolbar .brand-button:focus-visible) {
  color: var(--md-sys-color-on-surface) !important;
  background: var(--md-sys-state-hover) !important;
}

.toolbar-divider {
  width: 1px;
  height: 32px;
  align-self: center;
  margin: 0 5px;
  background: var(--md-sys-color-outline-variant);
}

.tool-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 56px;
  gap: 7px;
  padding: 8px 10px;
  white-space: nowrap;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--app-radius-md);
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  font-size: var(--app-font-size-label);
  cursor: pointer;
  transition:
    color var(--app-transition-fast),
    background-color var(--app-transition-fast);
}

.tool-button:hover {
  background: var(--md-sys-state-hover);
  color: var(--md-sys-color-on-surface);
}

.tool-button:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.tool-button:disabled:hover {
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
}

:global(.theme-dark) .tool-button:disabled,
:global(.dark) .tool-button:disabled {
  opacity: .5;
  color: var(--md-sys-color-on-surface-variant);
}

:global(.theme-dark) .tool-button:disabled:hover,
:global(.dark) .tool-button:disabled:hover {
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
}

.tool-button.is-refreshing:disabled {
  opacity: .82;
  color: var(--md-sys-color-on-primary-container);
  background: var(--md-sys-color-primary-container);
}

:global(.theme-dark) .tool-button.is-refreshing:disabled,
:global(.dark) .tool-button.is-refreshing:disabled {
  opacity: 1;
  color: var(--md-sys-color-on-primary-container);
  background: var(--md-sys-color-primary-container);
}

.tool-button.is-refreshing .el-icon {
  animation: toolbar-refresh-spin .8s linear infinite;
}

.tool-button.active {
  color: var(--md-sys-color-on-primary-container);
  background: var(--md-sys-color-primary-container);
}

.tool-button .el-icon {
  font-size: var(--app-font-size-title);
}

.open-in-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: auto;
  min-height: 56px;
  flex-direction: column;
  gap: 7px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--app-radius-md);
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
  cursor: pointer;
  transition:
    color var(--app-transition-fast),
    background-color var(--app-transition-fast),
    border-color var(--app-transition-fast);
}

.open-in-trigger:hover,
.open-in-trigger:focus-visible {
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-state-hover);
}

.open-in-trigger[aria-expanded="true"] {
  color: var(--md-sys-color-on-primary-container);
  background: var(--md-sys-color-primary-container);
}

.open-in-trigger:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.open-in-trigger:disabled:hover {
  color: var(--md-sys-color-on-surface-variant);
  background: transparent;
}

.open-in-app-icon {
  font-size: 20px;
}

.open-in-label {
  max-width: 90px;
  overflow: hidden;
  font-size: var(--app-font-size-label);
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.toolbar-dropdown .el-dropdown-menu__item .el-icon) {
  margin-right: 10px;
  color: inherit;
  font-size: 19px;
}

:global(.toolbar-dropdown .el-dropdown-menu__item.is-current-target) {
  color: var(--md-sys-color-on-primary-container);
  background: var(--md-sys-color-primary-container);
  font-weight: 600;
}

:global(.toolbar-dropdown .el-dropdown-menu__item.is-current-target .app-material-icon) {
  font-variation-settings:
    "FILL" 1,
    "wght" 500,
    "GRAD" 0,
    "opsz" 24;
}

@keyframes toolbar-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.fork-content {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
  background: var(--md-sys-color-surface);
}

.shell-sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 14px 10px;
  background: var(--md-sys-color-surface-container-lowest);
  border-right: 1px solid var(--md-sys-color-outline-variant);
}

.project-heading { display: flex; justify-content: space-between; gap: 8px; padding: 4px 10px 14px; color: var(--md-sys-color-on-surface-variant); font-size: var(--app-font-size-sm); }
.project-list { display: flex; flex-direction: column; gap: 4px; min-height: 0; overflow: auto; }
.project-list > :deep(.el-dropdown) { display: block; flex-shrink: 0; min-width: 0; }
.project-item, .project-add { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 56px; padding: 10px; border: 0; border-radius: var(--app-radius-sm); color: var(--md-sys-color-on-surface-variant); background: transparent; font: inherit; font-size: var(--app-font-size-label); text-align: left; cursor: pointer; }
.project-item:hover, .project-add:hover { color: var(--md-sys-color-on-surface); background: var(--md-sys-state-hover); }
.project-item.active { color: var(--md-sys-color-on-primary-container); background: var(--md-sys-color-primary-container); }
.project-item:disabled, .project-add:disabled { cursor: not-allowed; opacity: .6; }
.project-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 3px; }
.project-copy strong, .project-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-copy small { color: var(--md-sys-color-on-surface-variant); font-size: var(--app-font-size-xs); }
.project-count { font-size: var(--app-font-size-xs); font-variant-numeric: tabular-nums; }
.project-add { margin-top: auto; flex-shrink: 0; }
.project-empty { padding: 8px 10px; color: var(--md-sys-color-on-surface-variant); font-size: var(--app-font-size-sm); }
.sidebar-resizer { position: absolute; right: -3px; top: 0; bottom: 0; width: 6px; z-index: 2; cursor: col-resize; touch-action: none; }
.sidebar-resizer:hover, .sidebar-resizer:focus-visible { background: var(--md-sys-color-primary); }

.route-workbench {
  display: grid;
  grid-template-rows: var(--app-size-page-header) minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  margin: 6px;
  overflow: hidden;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--app-radius-sm);
  background: var(--md-sys-color-surface-container-lowest);
  box-shadow: var(--md-sys-elevation-2);
}

.route-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--md-sys-color-surface-container-lowest);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  color: var(--md-sys-color-on-surface);
  font-size: var(--app-font-size-title);
}

.route-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.route-title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.route-page { flex-shrink: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--app-font-size-label); }

.route-accent {
  display: none;
}

.route-repository {
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--app-font-size-sm);
}

.route-content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--md-sys-color-surface-container-lowest);
}

.route-content :deep(.left-panel),
.route-content :deep(.welcome-sidebar) {
  display: none;
}

.route-content :deep(.workspace-layout) {
  height: 100%;
}

.route-content :deep(.empty-state) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 0;
  padding: var(--app-spacing-2xl);
}

.route-content :deep(.empty-content) {
  margin: 0;
  width: min(100%, 570px);
}

.route-content :deep(.checkout-view),
.route-content :deep(.commit-view),
.route-content :deep(.update-view),
.route-content :deep(.settings-view),
.route-content :deep(.log-view),
.route-content :deep(.diff-view),
.route-content :deep(.blame-view) {
  width: 100%;
  max-width: none;
  min-height: 100%;
  margin: 0;
  padding: 0;
}

.route-content :deep(.el-card) {
  min-height: 100%;
  border: 0;
  border-radius: 0;
}

.route-content :deep(.el-card__header) {
  padding: 14px 24px;
  background: var(--md-sys-color-surface-container-lowest);
}

.route-content :deep(.el-card__body) {
  padding: 24px;
}

.route-content :deep(.checkout-view),
.route-content :deep(.commit-view),
.route-content :deep(.update-view),
.route-content :deep(.settings-view) {
  display: flex;
  min-height: 100%;
  background: transparent;
}

.route-content :deep(.checkout-card),
.route-content :deep(.commit-card),
.route-content :deep(.update-card),
.route-content :deep(.settings-card) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 100%;
  background: var(--md-sys-color-surface-container-lowest);
}

.route-content :deep(.checkout-card > .el-card__body),
.route-content :deep(.commit-card > .el-card__body),
.route-content :deep(.update-card > .el-card__body),
.route-content :deep(.settings-card > .el-card__body) {
  flex: 1;
  background: var(--md-sys-color-surface-container-lowest);
}

.fork-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-top: 1px solid var(--md-sys-color-outline-variant);
  background: var(--md-sys-color-surface-container);
  color: var(--md-sys-color-on-surface-variant);
  font-size: var(--app-font-size-xs);
}

.fork-status div {
  display: flex;
  gap: 14px;
  flex-shrink: 0;
}

.version-update {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--md-sys-color-primary);
  font: inherit;
  cursor: pointer;
}

.version-update:hover {
  text-decoration: underline;
}

.update-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--md-sys-color-primary);
}

.fork-status > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .fork-shell { grid-template-rows: auto minmax(0, 1fr) var(--app-size-statusbar); }
  .fork-toolbar { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); padding-block: 8px; row-gap: 8px; }
  .toolbar-brand { grid-column: 1; grid-row: 1; }
  .toolbar-group-right { grid-column: 2; grid-row: 1; }
  .toolbar-actions { grid-column: 1 / -1; grid-row: 2; justify-self: center; max-width: 100%; flex-wrap: wrap; justify-content: center; }
}
@media (max-width: 650px) {
  .fork-content { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
  .shell-sidebar { width: auto !important; max-height: 170px; padding: 8px; border-right: 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
  .project-heading { padding: 0 8px 4px; }
  .project-list { flex-direction: row; overflow-x: auto; flex-shrink: 0; }
  .project-list > :deep(.el-dropdown) { flex: 0 0 180px; }
  .project-item { min-height: 44px; }
  .project-copy small, .sidebar-resizer { display: none; }
  .project-add { min-height: 34px; flex-shrink: 0; }
  .toolbar-actions { gap: 4px; }
  .toolbar-divider { margin-inline: 2px; }
  .tool-button, .open-in-trigger { padding-inline: 8px; }
  .fork-toolbar { padding-inline: 12px; }
  .route-header { padding-inline: 12px; gap: 8px; }
  .route-title { font-size: var(--app-font-size-body); gap: 6px; }
  .route-repository { max-width: 36%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .route-content :deep(.empty-state) { padding: var(--app-spacing-xl) var(--app-spacing-lg); }
  .route-content :deep(.empty-actions) { flex-wrap: wrap; }
}
</style>
