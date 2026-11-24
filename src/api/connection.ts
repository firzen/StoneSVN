import { invoke } from '@tauri-apps/api/core'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { h, type VNode } from 'vue'
import i18n from '@/i18n'
import { useSettings, type ServerSecurity } from '@/composables/useSettings'

type SslFailure = { server: string; kind: 'tls' | 'certificate' }

export function parseSslFailure(error: unknown): SslFailure | null {
  const message = String(error)
  const kind = /\bE230001\b/.test(message) ? 'certificate' : /\bE120171\b/.test(message) ? 'tls' : null
  if (!kind) return null
  // SVN's English diagnostics quote the URL that actually failed. URL.origin
  // retains the exact port while stripping account names and repository paths.
  const match = /(?:URL|for)\s+'(https?\\?:\/\/[^']+)'/i.exec(message)
  if (!match) return null
  try {
    const url = new URL(match[1].replace(/\\:/g, ':'))
    return url.protocol === 'https:' ? { server: url.origin, kind } : null
  } catch {
    return null
  }
}

export function parseAuthFailure(error: unknown): { server: string; username: string } | null {
  const message = String(error)
  if (!/\bE(?:215004|170001)\b/.test(message)) return null
  const match = /(?:URL|for)\s+'(https?\\?:[^']+)'/i.exec(message)
  if (!match) return null
  try {
    const url = new URL(match[1].replace(/\\:/g, ':'))
    if (!['https:', 'http:'].includes(url.protocol)) return null
    return { server: url.origin, username: decodeURIComponent(url.username) }
  } catch { return null }
}

const pendingAuth = new Map<string, Promise<boolean>>()
async function requestCredentials(failure: { server: string; username: string }): Promise<boolean> {
  const key = `${failure.server}:${failure.username}`
  const existing = pendingAuth.get(key)
  if (existing) return existing
  const operation = dialogQueue.then(async () => {
    const t = i18n.global.t
    let username = failure.username
    let password = ''
    let form: HTMLFormElement | null = null
    try {
      await ElMessageBox.confirm(h('form', { onSubmit: (event: Event) => event.preventDefault(), onVnodeMounted: (vnode: VNode) => { form = vnode.el as HTMLFormElement | null } }, [
        h('p', failure.server),
        h('label', { style: { display: 'block', margin: '12px 0' } }, [t('svnAuth.username'), h('span', { class: 'el-input' }, [h('span', { class: 'el-input__wrapper' }, [h('input', {
          value: username, required: true, class: 'el-input__inner', autocomplete: 'username', 'aria-label': t('svnAuth.username'), readonly: !!failure.username,
          onInput: (event: Event) => { username = (event.target as HTMLInputElement).value },
        })])])]),
        h('label', { style: { display: 'block', margin: '12px 0' } }, [t('svnAuth.password'), h('span', { class: 'el-input' }, [h('span', { class: 'el-input__wrapper' }, [h('input', {
          type: 'password', required: true, class: 'el-input__inner', autocomplete: 'current-password', 'aria-label': t('svnAuth.password'),
          onInput: (event: Event) => { password = (event.target as HTMLInputElement).value },
        })])])]),
        h('p', t('svnAuth.sessionHint')),
      ]), t('svnAuth.title'), {
        confirmButtonText: t('svnAuth.retry'), cancelButtonText: t('common.cancel'),
        closeOnClickModal: false, distinguishCancelAndClose: true,
        beforeClose: (action, _instance, done) => {
          if (action !== 'confirm' || ((form?.reportValidity() ?? true) && username.trim() && password)) done()
        },
      })
      await invoke('configure_svn_credentials', { server: failure.server, username: username.trim(), password })
      return true
    } catch (action) {
      if (action === 'cancel' || action === 'close') return false
      throw action
    } finally { password = '' }
  })
  dialogQueue = operation.catch(() => undefined)
  pendingAuth.set(key, operation)
  try { return await operation } finally { pendingAuth.delete(key) }
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
  let authenticated = false
  let securityAttempts = 0
  for (;;) {
    try {
      return await invoke<T>(command, args)
    } catch (error) {
      const authentication = parseAuthFailure(error)
      if (authentication) {
        if (authenticated || !await requestCredentials(authentication)) throw error
        authenticated = true
        continue
      }
      const failure = parseSslFailure(error)
      if (securityAttempts >= 2 || !failure || !await requestException(failure)) throw error
      securityAttempts += 1
    }
  }
}
