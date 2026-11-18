<template>
  <div ref="host" class="conflict-code-compare" :aria-label="t('conflicts.codeCompare')"></div>
</template>
<script setup lang="ts">
import { nextTick, onActivated, onBeforeUnmount, onMounted, watch, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard'
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import 'monaco-editor/languages/definitions/typescript/register'
import 'monaco-editor/languages/definitions/javascript/register'
import 'monaco-editor/languages/definitions/php/register'
import 'monaco-editor/languages/definitions/python/register'
import 'monaco-editor/languages/definitions/rust/register'
import 'monaco-editor/languages/definitions/html/register'
import 'monaco-editor/languages/definitions/css/register'
import { useSettings } from '@/composables/useSettings'
import { conflictBlocks } from '@/utils/conflictDocument'

const props = withDefaults(defineProps<{ original: string; value: string; file: string; disabled?: boolean; markerSource?: string; wordWrap?: boolean; compact?: boolean; modifiedLabel?: string }>(), { markerSource: '', wordWrap: false })
const emit = defineEmits<{ 'update:value': [value: string]; active: [index: number]; ready: [] }>()
const { t } = useI18n(), { settings } = useSettings()
const host = ref<HTMLElement | null>(null)
let editor: monaco.editor.IStandaloneDiffEditor | undefined
let original: monaco.editor.ITextModel | undefined, modified: monaco.editor.ITextModel | undefined
let decorations: monaco.editor.IEditorDecorationsCollection | undefined
let initializing = false
let observer: MutationObserver | undefined
let layoutObserver: ResizeObserver | undefined
function layout() {
  const element = host.value
  if (element?.clientWidth && element.clientHeight) editor?.layout({ width: element.clientWidth, height: element.clientHeight })
}
let position = 0
const disposables: monaco.IDisposable[] = []
// Use the bundled local worker; the desktop app never loads editor code from a CDN.
;(globalThis as typeof globalThis & { MonacoEnvironment?: unknown }).MonacoEnvironment = { getWorker: () => new EditorWorker() }
function language(file: string) {
  const extension = file.split('.').pop()?.toLowerCase()
  return ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', vue: 'html', php: 'php', py: 'python', rs: 'rust', html: 'html', css: 'css', scss: 'css', json: 'javascript' } as Record<string, string>)[extension || ''] || 'plaintext'
}
function setTheme() {
  const dark = document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark'
  monaco.editor.setTheme(dark ? 'vs-dark' : 'vs')
}
function resetDecorations() {
  if (!modified || !editor) return
  const blocks = conflictBlocks(props.markerSource)
  const ranges: monaco.editor.IModelDeltaDecoration[] = []
  let removed = 0
  for (const block of blocks) {
    const start = block.start - removed
    const a = modified.getPositionAt(start), b = modified.getPositionAt(start + block.local.length)
    ranges.push({ range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), options: {
      isWholeLine: true, className: 'conflict-region', linesDecorationsClassName: 'conflict-gutter',
      stickiness: monaco.editor.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
      overviewRuler: { color: '#d89920', position: monaco.editor.OverviewRulerLane.Right },
      minimap: { color: '#d89920', position: monaco.editor.MinimapPosition.Inline },
    } })
    removed += block.end - block.start - block.local.length
  }
  decorations?.clear()
  decorations = editor.getModifiedEditor().createDecorationsCollection(ranges)
  position = 0
  if (ranges.length) reveal(0)
}
function reveal(index: number) {
  const range = decorations?.getRange(index)
  if (!range || !editor) return
  position = index
  editor.getModifiedEditor().revealRangeInCenter(range)
  editor.getModifiedEditor().setPosition(range.getStartPosition())
  emit('active', position)
}
function navigate(direction: 'previous' | 'next') {
  if (decorations?.length) reveal(Math.max(0, Math.min(position + (direction === 'next' ? 1 : -1), decorations.length - 1)))
  else editor?.goToDiff(direction)
}
function choose(index: number, side: 'local' | 'incoming') {
  const block = conflictBlocks(props.markerSource)[index], range = decorations?.getRange(index)
  if (!block || !range || !editor || props.disabled) return
  editor.getModifiedEditor().executeEdits('conflict-choice', [{ range, text: block[side], forceMoveMarkers: true }])
  editor.getModifiedEditor().pushUndoStop()
  reveal(index)
}
onMounted(() => {
  if (!host.value) return
  setTheme()
  original = monaco.editor.createModel(props.original, language(props.file))
  modified = monaco.editor.createModel(props.value, language(props.file))
  editor = monaco.editor.createDiffEditor(host.value, {
    automaticLayout: true, renderSideBySide: true, useInlineViewWhenSpaceIsLimited: false,
    originalEditable: false, readOnly: props.disabled, minimap: { enabled: false },
    lineNumbersMinChars: props.compact ? 3 : 5, lineDecorationsWidth: props.compact ? 8 : 10,
    fontSize: props.compact ? Math.min(settings.diffFontSize, 12) : settings.diffFontSize, fontFamily: 'Menlo, Monaco, Consolas, monospace', lineHeight: 22,
    scrollBeyondLastLine: false, wordWrap: props.wordWrap ? 'on' : 'off',
    renderOverviewRuler: !props.compact, renderIndicators: true, diffAlgorithm: 'advanced',
    ignoreTrimWhitespace: false, renderMarginRevertIcon: false, enableSplitViewResizing: true,
    stickyScroll: { enabled: false }, accessibilitySupport: 'auto',
    padding: { top: 10 }, ariaLabel: t('conflicts.codeCompare'),
    originalAriaLabel: t('conflicts.reference'), modifiedAriaLabel: props.modifiedLabel || t('conflicts.merged'),
  })
  editor.setModel({ original, modified })
  disposables.push(modified.onDidChangeContent(() => { if (!initializing && modified) emit('update:value', modified.getValue(monaco.editor.EndOfLinePreference.TextDefined)) }))
  disposables.push(editor.getModifiedEditor().onDidChangeCursorPosition(event => {
    if (!decorations) return
    for (let i = 0; i < decorations.length; i++) {
      if (decorations.getRange(i)?.containsPosition(event.position)) { position = i; emit('active', i); break }
    }
  }))
  observer = new MutationObserver(setTheme)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
  layoutObserver = new ResizeObserver(layout)
  layoutObserver.observe(host.value)
  layout()
  resetDecorations(); emit('ready')
})
watch(() => props.original, text => { if (original && original.getValue(monaco.editor.EndOfLinePreference.TextDefined) !== text) original.setValue(text) })
watch(() => props.value, text => {
  if (modified && modified.getValue(monaco.editor.EndOfLinePreference.TextDefined) !== text) {
    initializing = true; modified.setValue(text); initializing = false; resetDecorations()
  }
})
watch(() => props.markerSource, resetDecorations)
watch(() => [props.disabled, props.wordWrap, props.compact, settings.diffFontSize], () => editor?.updateOptions({ readOnly: props.disabled, wordWrap: props.wordWrap ? 'on' : 'off', fontSize: props.compact ? Math.min(settings.diffFontSize, 12) : settings.diffFontSize }))
onActivated(() => { void nextTick(layout) })
onBeforeUnmount(() => { layoutObserver?.disconnect(); observer?.disconnect(); disposables.forEach(d => d.dispose()); editor?.dispose(); original?.dispose(); modified?.dispose() })
defineExpose({ navigate, choose, reveal })
</script>
<style scoped>
.conflict-code-compare { flex: 1; min-height: 220px; min-width: 0; overflow: hidden; }
.conflict-code-compare :deep(.conflict-region) { background: color-mix(in srgb, var(--el-color-warning) 13%, transparent); }
.conflict-code-compare :deep(.conflict-gutter) { border-left: 3px solid var(--el-color-warning); margin-left: 3px; }
</style>
