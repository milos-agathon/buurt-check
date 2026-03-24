import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { loadEnv } from './android-config.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function parsePositiveInt(value, fallback, label) {
  const parsed = Number.parseInt(value ?? '', 10)
  if (Number.isNaN(parsed)) {
    return fallback
  }
  if (parsed < 1) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return parsed
}

export function resolveIosConfig() {
  const env = loadEnv()
  const baseUrl = new URL(env.BUURT_BASE_URL || 'https://app.buurt-check.nl')
  const buildNumber = parsePositiveInt(env.BUURT_IOS_BUILD_NUMBER, 1, 'BUURT_IOS_BUILD_NUMBER')
  const versionName = (env.BUURT_IOS_VERSION_NAME || '1.0.0').trim()
  const bundleId = (env.BUURT_IOS_BUNDLE_ID || 'nl.buurtcheck.app.ios').trim()
  const teamId = (env.BUURT_IOS_TEAM_ID || '').trim()

  if (!versionName) {
    throw new Error('BUURT_IOS_VERSION_NAME must not be empty.')
  }
  if (!bundleId) {
    throw new Error('BUURT_IOS_BUNDLE_ID must not be empty.')
  }

  return {
    baseUrl,
    host: baseUrl.host,
    bundleId,
    versionName,
    buildNumber,
    teamId,
    workspacePath: resolve(ROOT, 'ios', 'App', 'App.xcworkspace'),
    projectPath: resolve(ROOT, 'ios', 'App', 'App.xcodeproj'),
    scheme: 'App',
    archivePath: resolve(ROOT, 'ios', 'build', 'BuurtCheck.xcarchive'),
    exportDir: resolve(ROOT, 'ios', 'build'),
  }
}

export const paths = {
  root: ROOT,
  frontendDir: resolve(ROOT, 'frontend'),
  iosDir: resolve(ROOT, 'ios'),
  iosAppDir: resolve(ROOT, 'ios', 'App'),
  iosWorkspace: resolve(ROOT, 'ios', 'App', 'App.xcworkspace'),
  iosProject: resolve(ROOT, 'ios', 'App', 'App.xcodeproj'),
  iosPbxproj: resolve(ROOT, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'),
  iosInfoPlist: resolve(ROOT, 'ios', 'App', 'App', 'Info.plist'),
  iosEntitlements: resolve(ROOT, 'ios', 'App', 'App', 'App.entitlements'),
}

export function iosProjectExists() {
  return existsSync(paths.iosProject)
}
