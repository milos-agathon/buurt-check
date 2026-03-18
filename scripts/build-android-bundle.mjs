import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { loadEnv, paths } from './android-config.mjs'

const require = createRequire(import.meta.url)
const bubblewrapBin = require.resolve('@bubblewrap/cli/bin/bubblewrap.js')

function runNode(args, env, cwd = process.cwd()) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      shell: false,
      env,
      cwd,
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

async function main() {
  const env = {
    ...process.env,
    ...loadEnv(),
  }

  if (env.BUURT_ANDROID_KEYSTORE_PASSWORD && !env.BUBBLEWRAP_KEYSTORE_PASSWORD) {
    env.BUBBLEWRAP_KEYSTORE_PASSWORD = env.BUURT_ANDROID_KEYSTORE_PASSWORD
  }

  if (env.BUURT_ANDROID_KEY_PASSWORD && !env.BUBBLEWRAP_KEY_PASSWORD) {
    env.BUBBLEWRAP_KEY_PASSWORD = env.BUURT_ANDROID_KEY_PASSWORD
  }

  if (!existsSync(paths.androidManifest)) {
    throw new Error('Missing android/twa-manifest.json. Run `npm run android:sync` first.')
  }

  const buildArgs = [bubblewrapBin, 'build', '--manifest', 'twa-manifest.json']

  if (env.BUURT_ANDROID_SKIP_PWA_VALIDATION === 'true') {
    buildArgs.push('--skipPwaValidation')
  }

  if (env.BUURT_ANDROID_SKIP_SIGNING === 'true') {
    buildArgs.push('--skipSigning')
  }

  await runNode(['./scripts/update-android-wrapper.mjs'], env)
  await runNode(buildArgs, env, paths.androidDir)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
