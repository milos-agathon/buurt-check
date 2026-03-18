import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { loadEnv } from './android-config.mjs'

function loadBubblewrapConfig() {
  const configPath = resolve(homedir(), '.bubblewrap', 'config.json')

  if (!existsSync(configPath)) {
    throw new Error('Bubblewrap is not configured yet. Run `npm run android:sync` first.')
  }

  return JSON.parse(readFileSync(configPath, 'utf8'))
}

function requireEnv(env, key) {
  const value = env[key]?.trim()

  if (!value) {
    throw new Error(`Missing required env var ${key}.`)
  }

  return value
}

async function main() {
  const env = {
    ...loadEnv(),
    ...process.env,
  }
  const bubblewrapConfig = loadBubblewrapConfig()
  const keytoolPath = resolve(bubblewrapConfig.jdkPath, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool')
  const keystorePath = resolve(env.BUURT_ANDROID_KEYSTORE_PATH || './android/android-upload-key.jks')
  const alias = (env.BUURT_ANDROID_KEY_ALIAS || 'upload').trim()
  const storePassword = requireEnv(env, 'BUURT_ANDROID_KEYSTORE_PASSWORD')
  const keyPassword = requireEnv(env, 'BUURT_ANDROID_KEY_PASSWORD')
  const commonName = (env.BUURT_ANDROID_KEY_FULL_NAME || 'Buurt Check').trim()
  const orgUnit = (env.BUURT_ANDROID_KEY_ORG_UNIT || 'Engineering').trim()
  const organization = (env.BUURT_ANDROID_KEY_ORGANIZATION || 'Buurt Check').trim()
  const country = (env.BUURT_ANDROID_KEY_COUNTRY || 'NL').trim()
  const overwrite = env.BUURT_ANDROID_KEY_OVERWRITE === 'true'

  if (existsSync(keystorePath) && !overwrite) {
    throw new Error(`Keystore already exists at ${keystorePath}. Set BUURT_ANDROID_KEY_OVERWRITE=true to replace it.`)
  }

  mkdirSync(dirname(keystorePath), { recursive: true })

  const args = [
    '-genkeypair',
    '-v',
    '-storetype',
    'PKCS12',
    '-keystore',
    keystorePath,
    '-alias',
    alias,
    '-keyalg',
    'RSA',
    '-keysize',
    '2048',
    '-validity',
    '10000',
    '-dname',
    `CN=${commonName}, OU=${orgUnit}, O=${organization}, C=${country}`,
    '-storepass',
    storePassword,
    '-keypass',
    keyPassword,
  ]

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(keytoolPath, args, {
      stdio: 'inherit',
      shell: false,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`keytool exited with code ${code}.`))
    })

    child.on('error', rejectPromise)
  })

  console.log(`Created upload keystore at ${keystorePath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
