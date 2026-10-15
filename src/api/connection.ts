import { invoke } from '@tauri-apps/api/core'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { h } from 'vue'
import i18n from '@/i18n'
import { useSettings, type ServerSecurity } from '@/composables/useSettings'

type SslFailure = { server: string; kind: 'tls' | 'certificate' }

export function parseSslFailure(error: unknown): SslFailure | null {
  const message = String(error)
  const kind = /\bE230001\b/.test(message) ? 'certificate' : /\bE120171\b/.test(message) ? 'tls' : null
  if (!kind) return null
  // SVN's English diagnostics quote the URL that actually failed. URL.origin
  // retains the exact port while stripping account names and repository paths.
  const match = /(?:URL|for)\s+'(https:\/\/[^']+)'/i.exec(message)
  if (!match) return null
  try {
    const url = new URL(match[1])
    return url.protocol === 'https:' ? { server: url.origin, kind } : null
  } catch {
    return null
  }
}

const pending = new Map<string, Promise<boolean>>()
let dialogQueue: Promise<unknown> = Promise.resolve()

function policyFor(server: string): ServerSecurity {
  const { settings } = useSettings()
  const remembered = settings.svnServerSecurity?.[server]
  if (remembered) return { ...remembered }
  return { legacyTls: false, trustInvalidCertificates: false }
}

async function requestException(failure: SslFailure): Promise<boolean> {
  const key = `${failure.server}:${failure.kind}`
  const existing = pending.get(key)
  if (existing) return existing
  const field = failure.kind === 'tls' ? 'legacyTls' : 'trustInvalidCertificates'
  // If the exception was already active, repeating the command cannot fix it.
  if (policyFor(failure.server)[field]) return false
  const operation = dialogQueue.then(async () => {
    const policy = policyFor(failure.server)
    if (policy[field]) return true
    const t = i18n.global.t
    try {
      await ElMessageBox.confirm(
        h('div', [h('p', t(`connectionSecurity.${failure.kind}Message`)), h('code', failure.server), h('p', t('connectionSecurity.rememberHint'))]),
        t(`connectionSecurity.${failure.kind}Title`),
        { type: 'warning', confirmButtonText: t(`connectionSecurity.${failure.kind}Accept`), cancelButtonText: t('common.cancel'), closeOnClickModal: false, distinguishCancelAndClose: true },
      )
    } catch (action) {
      if (action === 'cancel' || action === 'close') return false
      throw action
    }
    // Read again after the dialog: a preceding request may have granted the
    // other exception. Never replace a grant for another server.
    const next = { ...policyFor(failure.server), [field]: true }
    const server = await invoke<string>('configure_svn_server_security', { server: failure.server, ...next })
    const { settings, updateSettings } = useSettings()
    updateSettings({ svnServerSecurity: { ...settings.svnServerSecurity, [server]: next } })
    return true
  })
  dialogQueue = operation.catch(() => undefined)
  pending.set(key, operation)
  try {
    return await operation
  } finally {
    if (pending.get(key) === operation) pending.delete(key)
  }
}

// Use only for reads and repeatable update operations. Mutations that could
// publish changes use a read-only connection check before their single attempt.
export async function invokeWithConnectionPrompt<T>(command: string, args: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await invoke<T>(command, args)
    } catch (error) {
      const failure = parseSslFailure(error)
      if (attempt >= 2 || !failure || !await requestException(failure)) throw error
    }
  }
}
