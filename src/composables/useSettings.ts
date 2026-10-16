import { reactive, watch } from 'vue'
import { detectSystemLocale } from '@/i18n'

export interface ServerSecurity {
  legacyTls: boolean
  trustInvalidCertificates: boolean
}

export interface AppSettings {
  svnPath: string
  svnServerSecurity: Record<string, ServerSecurity>
  encoding: string
  logLimit: number
  theme: 'light' | 'dark' | 'auto'
  language: string
  gitignoreEnabled: boolean
  filterRules: string
}

const STORAGE_KEY = 'orcasvn-settings'

const defaults: AppSettings = {
  svnPath: '',
  svnServerSecurity: {},
  encoding: 'utf-8',
  logLimit: 50,
  theme: 'auto',
  language: detectSystemLocale(),
  gitignoreEnabled: false,
  filterRules: '.gitignore',
}

function httpsOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const { svnLegacyTlsEnabled, svnLegacyTlsServer, svnLegacyTlsTrustInvalidCertificates, ...saved } = JSON.parse(stored)
      const servers: Record<string, ServerSecurity> = {}
      for (const [server, policy] of Object.entries(saved.svnServerSecurity || {})) {
        const entry = policy as Partial<ServerSecurity> | null
        if (entry && typeof entry.legacyTls === 'boolean' && typeof entry.trustInvalidCertificates === 'boolean') {
          const origin = httpsOrigin(server)
          if (origin) servers[origin] = { legacyTls: entry.legacyTls, trustInvalidCertificates: entry.trustInvalidCertificates }
        }
      }
      if (svnLegacyTlsEnabled && typeof svnLegacyTlsServer === 'string') {
        const origin = httpsOrigin(svnLegacyTlsServer)
        if (origin && !servers[origin]) {
          servers[origin] = { legacyTls: true, trustInvalidCertificates: svnLegacyTlsTrustInvalidCertificates === true }
        }
      }
      return { ...defaults, ...saved, filterRules: typeof saved.filterRules === 'string' ? saved.filterRules : defaults.filterRules, svnServerSecurity: servers }
    }
  } catch {
    // ignore parse errors
  }
  return { ...defaults }
}

const settings = reactive<AppSettings>(loadSettings())

watch(
  () => ({ ...settings }),
  (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  },
  { deep: true }
)

export function useSettings() {
  function updateSettings(partial: Partial<AppSettings>) {
    Object.assign(settings, partial)
  }

  function resetSettings() {
    Object.assign(settings, defaults)
  }

  return { settings, updateSettings, resetSettings }
}
