import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createTwaManifestJson, paths, resolveAndroidConfig } from './android-config.mjs'

const require = createRequire(import.meta.url)
const bubblewrapBin = require.resolve('@bubblewrap/cli/bin/bubblewrap.js')

function runNode(args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      shell: false,
      ...options,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`Command failed with exit code ${code}.`))
    })

    child.on('error', rejectPromise)
  })
}

function replaceInGeneratedFiles(directory, searchValue, replaceValue) {
  for (const entry of readdirSync(directory)) {
    if (entry === '.git' || entry === '.gradle' || entry === 'build') {
      continue
    }

    const fullPath = resolve(directory, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      replaceInGeneratedFiles(fullPath, searchValue, replaceValue)
      continue
    }

    if (!/\.(gradle|json|kt|properties|xml)$/i.test(entry)) {
      continue
    }

    const original = readFileSync(fullPath, 'utf8')

    if (!original.includes(searchValue)) {
      continue
    }

    writeFileSync(fullPath, original.split(searchValue).join(replaceValue), 'utf8')
  }
}

function writeChecksum(manifestPath, checksumPath) {
  const checksum = createHash('sha1')
    .update(readFileSync(manifestPath))
    .digest('hex')

  writeFileSync(checksumPath, checksum, 'utf8')
}

function normalizeGeneratedProject() {
  const buildGradlePath = resolve(paths.androidDir, 'build.gradle')
  const original = readFileSync(buildGradlePath, 'utf8')
  const normalized = original.replaceAll('jcenter()', 'mavenCentral()')

  if (normalized !== original) {
    writeFileSync(buildGradlePath, normalized, 'utf8')
  }
}

async function main() {
  const config = resolveAndroidConfig()
  const canonicalManifest = createTwaManifestJson()
  const generationManifest = createTwaManifestJson({ assetOrigin: config.assetOrigin })
  const canonicalJson = `${JSON.stringify(canonicalManifest, null, 2)}\n`
  const generationJson = `${JSON.stringify(generationManifest, null, 2)}\n`
  const tempManifestDir = resolve(paths.androidDir, '.generated')
  const tempManifestPath = resolve(tempManifestDir, 'twa-manifest.json')
  const canonicalOrigin = config.baseOrigin
  const assetOrigin = config.assetOrigin

  mkdirSync(paths.androidDir, { recursive: true })
  mkdirSync(tempManifestDir, { recursive: true })
  writeFileSync(paths.androidManifest, canonicalJson, 'utf8')

  let manifestPathForGeneration = paths.androidManifest

  if (assetOrigin !== canonicalOrigin) {
    writeFileSync(tempManifestPath, generationJson, 'utf8')
    manifestPathForGeneration = tempManifestPath
  }

  await runNode([
    bubblewrapBin,
    'update',
    '--skipVersionUpgrade',
    '--directory',
    paths.androidDir,
    '--manifest',
    manifestPathForGeneration,
  ])

  if (assetOrigin !== canonicalOrigin) {
    replaceInGeneratedFiles(paths.androidDir, assetOrigin, canonicalOrigin)
  }

  normalizeGeneratedProject()
  writeFileSync(paths.androidManifest, canonicalJson, 'utf8')
  writeChecksum(paths.androidManifest, paths.androidChecksum)

  console.log(`Android wrapper synced in ${paths.androidDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
