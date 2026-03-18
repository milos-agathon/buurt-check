import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createTwaManifestJson, paths } from './android-config.mjs'

function getOutputPath() {
  const outputIndex = process.argv.indexOf('--output')

  if (outputIndex !== -1 && process.argv[outputIndex + 1]) {
    return process.argv[outputIndex + 1]
  }

  return paths.androidManifest
}

const outputPath = getOutputPath()
const manifest = createTwaManifestJson()

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`Generated ${outputPath}`)
