<template>
  <div class="checkout-view">
    <el-card class="checkout-card animate-fade-in">
      <template #header>
        <div class="card-header">
          <span class="card-title">
            <el-icon><Download /></el-icon>
            {{ $t('checkout.title') }}
          </span>
        </div>
      </template>

      <el-form
        :model="form"
        label-width="120px"
        class="checkout-form"
        label-position="left"
        require-asterisk-position="right"
      >
        <el-form-item :label="$t('checkout.repositoryUrl')" required class="form-item">
          <el-input
            v-model="form.url"
            @keyup.enter="browse"
            :placeholder="$t('checkout.repositoryUrlPlaceholder')"
            class="checkout-control"
            clearable
          >
            <template #prefix>
              <el-icon><Link /></el-icon>
            </template>
            <template #append>
              <el-button @click="browse" :loading="browsing" :disabled="!form.url.trim() || loading">{{ $t('common.browse') }}</el-button>
            </template>
          </el-input>
        </el-form-item>

        <el-dialog v-model="browserVisible" :title="$t('checkout.selectDirectory')" width="640px" append-to-body>
          <div class="repository-browser" v-loading="browsing">
            <el-tree v-if="roots.length" :key="generation" :data="roots" node-key="url"
              lazy :props="{ isLeaf: 'isLeaf' }" :load="loadDirectories" :default-expanded-keys="roots.map(node => node.url)"
              highlight-current :current-node-key="pendingUrl"
              :expand-on-click-node="false" @node-click="selectNode">
              <template #default="{ data, node }">
                <span class="repository-entry" :class="{ 'repository-file': data.isLeaf }" @dblclick.stop="toggleDirectory(node)">
                  <FileTypeIcon :path="data.label" :directory="!data.isLeaf" />
                  <span class="repository-entry-name">{{ data.label }}</span>
                </span>
              </template>
            </el-tree>
            <div class="selected-url">{{ pendingUrl }}</div>
            <div v-if="browseError" role="alert">{{ browseError }}</div>
          </div>
          <template #footer>
            <el-button @click="browserVisible = false">{{ $t('common.cancel') }}</el-button>
            <el-button v-if="browseError" @click="browse" :loading="browsing">{{ $t('common.browse') }}</el-button>
            <el-button type="primary" :disabled="!pendingUrl || browsing" @click="confirmDirectory">{{ $t('common.confirm') }}</el-button>
          </template>
        </el-dialog>
        <el-form-item :label="$t('checkout.targetDirectory')" required class="form-item">
          <el-input
            v-model="form.path"
            :placeholder="$t('checkout.selectTargetDirectory')"
            class="checkout-control"
            clearable
          >
            <template #prefix>
              <el-icon><Folder /></el-icon>
            </template>
            <template #append>
              <el-button @click="selectDirectory">
                <el-icon><FolderOpened /></el-icon>
                {{ $t('common.browse') }}
              </el-button>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item :label="$t('checkout.revision')" class="form-item">
          <el-input
            v-model.number="form.revision"
            type="number"
            :placeholder="$t('checkout.revisionPlaceholder')"
            class="checkout-control revision-control"
            clearable
          >
            <template #prefix>
              <el-icon><PriceTag /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item class="form-actions">
          <el-button type="primary" @click="doCheckout" :loading="loading" :disabled="!selectedUrl || !form.path || browsing" size="large">
            <el-icon><Download /></el-icon>
            {{ $t('checkout.startCheckout') }}
          </el-button>
          <el-button @click="resetForm" size="large">
            <el-icon><RefreshLeft /></el-icon>
            {{ $t('common.reset') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="output" class="output-area animate-fade-in">
        <div class="output-header">
          <span class="output-title">
            <el-icon><Document /></el-icon>
            {{ $t('checkout.output') }}
          </span>
          <el-tag :type="output.includes('Error') ? 'danger' : 'success'" size="small">
            {{ output.includes('Error') ? $t('common.error') : $t('common.success') }}
          </el-tag>
        </div>
        <el-input
          v-model="output"
          type="textarea"
          :rows="10"
          readonly
          class="output-textarea"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import FileTypeIcon from '@/components/FileTypeIcon.vue'
import { ElTree } from 'element-plus/es/components/tree/index'
import type { LoadFunction } from 'element-plus/es/components/tree/src/tree.type'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import { svnCheckout, svnBrowseEntries } from '@/api/svn'
import { open } from '@tauri-apps/plugin-dialog'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()
const workspaceStore = useWorkspaceStore()

const form = reactive({
  url: '',
  path: '',
  revision: undefined as number | undefined
})

interface DirectoryNode { url: string; label: string; isLeaf: boolean }
const roots = ref<DirectoryNode[]>([])
let initialDirectories: DirectoryNode[] = []
const selectedUrl = ref('')
const pendingUrl = ref('')
const browserVisible = ref(false)
const confirmDirectory = () => {
  const url = pendingUrl.value
  if (!url) return
  form.url = url
  selectedUrl.value = url
  browserVisible.value = false
}
const browsing = ref(false)
const browseError = ref('')
const generation = ref(0)
watch(() => [form.url, form.revision], () => {
  generation.value++
  roots.value = []
  selectedUrl.value = ''
  pendingUrl.value = ''
  browsing.value = false
  browseError.value = ''
}, { flush: 'sync' })

const browse = async () => {
  browserVisible.value = true
  const request = ++generation.value
  browsing.value = true
  browseError.value = ''
  pendingUrl.value = ''
  roots.value = []
  try {
    const url = form.url.trim().replace(/\/+$/, '')
    const urls = await svnBrowseEntries(url, form.revision || undefined)
    if (request !== generation.value) return
    initialDirectories = urls.map(entry => ({ url: entry.url, label: entry.name, isLeaf: !entry.is_directory }))
    roots.value = [{ url, label: t('checkout.wholeProject'), isLeaf: false }]
    pendingUrl.value = selectedUrl.value || url
  } catch (error) {
    if (request === generation.value) browseError.value = String(error)
  } finally {
    if (request === generation.value) browsing.value = false
  }
}
const toggleDirectory = (node: Parameters<LoadFunction>[0]) => {
  if (node.data.isLeaf) return
  if (node.expanded) node.collapse()
  else node.expand()
}
const selectNode = (node: DirectoryNode) => { if (!node.isLeaf) pendingUrl.value = node.url }
const loadDirectories: LoadFunction = async (node, resolve, reject) => {
  if (node.level === 0) { resolve(roots.value); return }
  if (node.data.url === roots.value[0]?.url) { resolve(initialDirectories); return }
  const request = generation.value
  try {
    const urls = await svnBrowseEntries(node.data.url, form.revision || undefined)
    if (request !== generation.value) { resolve([]); return }
    resolve(urls.map(entry => ({ url: entry.url, label: entry.name, isLeaf: !entry.is_directory })))
  } catch (error) {
    if (request === generation.value) browseError.value = String(error)
    reject()
  }
}
const loading = ref(false)
const output = ref('')

const selectDirectory = async () => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: t('dialog.selectTargetDirectory')
  })

  if (selected) {
    form.path = Array.isArray(selected) ? selected[0] : selected
  }
}

const doCheckout = async () => {
  if (!selectedUrl.value || !form.path) {
    return
  }

  loading.value = true
  output.value = ''

  try {
    const result = await svnCheckout(selectedUrl.value, form.path, form.revision || undefined)
    output.value = result.output

    workspaceStore.setCurrentPath(form.path)

    setTimeout(() => {
      router.push({ name: 'workspace' })
    }, 1500)
  } catch (err) {
    output.value = `${t('common.error')}：${err}`
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.url = ''
  form.path = ''
  form.revision = undefined
  output.value = ''
}
</script>

<style scoped>
.checkout-view {
  max-width: 800px;
  margin: 0 auto;
  background: var(--md-sys-color-surface);
}

.checkout-card {
  border-radius: var(--app-radius-lg);
  background: var(--md-sys-color-surface);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: var(--app-spacing-sm);
  font-weight: 700;
}

.checkout-form {
  margin-top: var(--app-spacing-md);
}

.checkout-form :deep(.el-form-item__label) {
  position: relative;
  display: block;
  overflow: hidden;
  padding-right: 20px;
  line-height: 32px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.checkout-form :deep(.el-form-item.is-required .el-form-item__label::before) {
  display: none;
}

.checkout-form :deep(.el-form-item.is-required .el-form-item__label::after) {
  content: "*";
  margin-left: 5px;
  color: var(--el-color-danger);
}

.form-item {
  margin-bottom: var(--app-spacing-lg);
}

.checkout-control {
  width: 520px;
  max-width: 100%;
}

.repository-browser {
  min-height: 120px;
}

.repository-browser :deep(.el-tree) {
  max-height: 360px;
  overflow: auto;
  margin-bottom: 12px;
}

.repository-entry {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1;
  font-size: 12px;
}

.repository-entry-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-browser :deep(.el-tree-node__content) {
  height: 30px;
  font-size: 12px;
}

.repository-browser :deep(.el-tree-node__content:hover) {
  background: var(--el-fill-color-light);
}

.repository-browser :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  box-shadow: inset 3px 0 var(--el-color-primary);
}

.selected-url {
  overflow-wrap: anywhere;
}

.revision-control {
  width: 240px;
}

.form-actions {
  margin-bottom: 0;
  margin-top: var(--app-spacing-lg);
}

.output-area {
  margin-top: var(--app-spacing-lg);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--app-radius-md);
  overflow: hidden;
}

.output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--app-spacing) var(--app-spacing-md);
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}

.output-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: var(--app-font-size-label);
  color: var(--el-text-color-regular);
}

.output-textarea {
  font-family: var(--app-font-family-mono);
}

:deep(.output-textarea .el-textarea__inner) {
  border: none;
  border-radius: 0;
  padding: var(--app-spacing-md);
}

@media (max-width: 640px) {
  .checkout-view {
    padding: 0 var(--app-spacing);
  }
  
  .checkout-form :deep(.el-form-item) {
    flex-direction: column;
  }
  
  .checkout-form :deep(.el-form-item__label) {
    text-align: left;
    padding-bottom: 4px;
    width: 100% !important;
  }

  .checkout-control,
  .revision-control {
    width: 100%;
  }
  
  .form-actions {
    display: flex;
    flex-direction: column;
  }
  
  .form-actions .el-button {
    width: 100%;
  }
}
</style>
