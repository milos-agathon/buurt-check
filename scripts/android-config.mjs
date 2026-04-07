import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FRONTEND_MANIFEST_PATH = resolve(ROOT, 'frontend', 'public', 'manifest.json')

const ENV_FILES = ['.env', '.env.local']

function normalizePath(value) {
  if (process.platform !== 'win32') {
    return value
  }

  return value.replace(/^\/([A-Za-z]):\//, '$1:/')
}

function parseEnvFile(filePath) {
  const env = {}

  if (!existsSync(filePath)) {
    return env
  }

  const contents = readFileSync(filePath, 'utf8')

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')

    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

export function loadEnv() {
  const merged = {}

  for (const file of ENV_FILES) {
    Object.assign(merged, parseEnvFile(resolve(ROOT, file)))
  }

  Object.assign(merged, process.env)
  return merged
}

function readFrontendManifest() {
  return JSON.parse(readFileSync(FRONTEND_MANIFEST_PATH, 'utf8'))
}

function getIconPath(manifest, purpose) {
  const candidate = manifest.icons?.find((icon) =>
    icon.sizes === '512x512' && icon.purpose === purpose,
  )

  if (candidate?.src) {
    return candidate.src
  }

  if (purpose === 'maskable') {
    return '/logos/app_icons/pwa-512x512-maskable.png'
  }

  return '/logos/app_icons/pwa-512x512.png'
}

function clampLauncherName(value) {
  const trimmed = value.trim()

  if (trimmed.length <= 12) {
    return trimmed
  }

  return trimmed.slice(0, 12)
}

export function resolveAndroidConfig() {
  const env = loadEnv()
  const manifest = readFrontendManifest()
  const baseUrl = new URL(env.BUURT_BASE_URL || 'https://app.buurt-check.nl')
  const assetOrigin = new URL(env.BUURT_ANDROID_ASSET_ORIGIN || baseUrl.origin)
  const versionCode = Number.parseInt(env.BUURT_ANDROID_VERSION_CODE || '1', 10)

  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error('BUURT_ANDROID_VERSION_CODE must be a positive integer.')
  }

  const launcherName = clampLauncherName(
    env.BUURT_ANDROID_LAUNCHER_NAME || manifest.short_name || manifest.name || 'Buurt Check',
  )
  const name = (env.BUURT_ANDROID_APP_NAME || manifest.name || 'Buurt Check').trim()
  const fullStartUrl = new URL(manifest.start_url || '/', baseUrl)
  const startUrl = fullStartUrl.pathname + fullStartUrl.search + fullStartUrl.hash
  const scopeUrl = new URL(manifest.scope || '/', baseUrl).toString()
  const packageId = (
    env.BUURT_GOOGLE_PLAY_PACKAGE_NAME
    || env.VITE_PLAY_PACKAGE_NAME
    || 'nl.buurtcheck.app'
  ).trim()
  const serviceAccountJsonFile = (env.BUURT_GOOGLE_PLAY_SERVICE_ACCOUNT_FILE || '').trim()
  const themeColor = manifest.theme_color || '#FAFBFC'
  const backgroundColor = manifest.background_color || '#FAFBFC'

  return {
    assetOrigin: assetOrigin.toString().replace(/\/$/, ''),
    baseOrigin: baseUrl.origin,
    host: baseUrl.host,
    name,
    launcherName,
    packageId,
    versionCode,
    versionName: (env.BUURT_ANDROID_VERSION_NAME || '1.0.0').trim(),
    themeColor,
    backgroundColor,
    startUrl,
    fullScopeUrl: scopeUrl,
    display: manifest.display === 'fullscreen' ? 'fullscreen' : 'standalone',
    orientation: manifest.orientation || 'portrait-primary',
    iconPath: getIconPath(manifest, 'any'),
    maskableIconPath: getIconPath(manifest, 'maskable'),
    monochromeIconPath: '/logos/app_icons/AppIcon_Mono.png',
    signingKeyPath: normalizePath(
      (env.BUURT_ANDROID_KEYSTORE_PATH || './android/android-upload-key.jks').trim(),
    ),
    signingKeyAlias: (env.BUURT_ANDROID_KEY_ALIAS || 'upload').trim(),
    serviceAccountJsonFile: serviceAccountJsonFile
      ? normalizePath(serviceAccountJsonFile)
      : undefined,
  }
}

export function createTwaManifestJson(options = {}) {
  const config = resolveAndroidConfig()
  const assetOrigin = new URL(options.assetOrigin || config.baseOrigin)

  return {
    packageId: config.packageId,
    host: config.host,
    name: config.name,
    launcherName: config.launcherName,
    display: config.display,
    themeColor: config.themeColor,
    themeColorDark: config.themeColor,
    navigationColor: config.themeColor,
    navigationColorDark: config.themeColor,
    navigationDividerColor: '#00000000',
    navigationDividerColorDark: '#00000000',
    backgroundColor: config.backgroundColor,
    enableNotifications: true,
    enableSiteSettingsShortcut: true,
    startUrl: config.startUrl,
    iconUrl: new URL(config.iconPath, assetOrigin).toString(),
    maskableIconUrl: new URL(config.maskableIconPath, assetOrigin).toString(),
    monochromeIconUrl: new URL(config.monochromeIconPath, assetOrigin).toString(),
    splashScreenFadeOutDuration: 300,
    fallbackType: 'customtabs',
    orientation: config.orientation,
    fullScopeUrl: config.fullScopeUrl,
    appVersion: config.versionName,
    appVersionCode: config.versionCode,
    signingKey: {
      path: config.signingKeyPath,
      alias: config.signingKeyAlias,
    },
    generatorApp: 'bubblewrap-cli',
    webManifestUrl: new URL('/manifest.json', assetOrigin).toString(),
    features: {
      playBilling: {
        enabled: true,
      },
    },
    serviceAccountJsonFile: config.serviceAccountJsonFile,
    shortcuts: [],
    additionalTrustedOrigins: [],
  }
}

export const paths = {
  root: ROOT,
  frontendManifest: FRONTEND_MANIFEST_PATH,
  androidDir: resolve(ROOT, 'android'),
  androidManifest: resolve(ROOT, 'android', 'twa-manifest.json'),
  androidChecksum: resolve(ROOT, 'android', 'manifest-checksum.txt'),
}
