import { rm, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const temporaryRoot = resolve(projectRoot, '.tmp/tests')

await mkdir(temporaryRoot, { recursive: true })
process.env.TEMP = temporaryRoot
process.env.TMP = temporaryRoot

const vitestEntrypoint = resolve(projectRoot, 'node_modules/vitest/vitest.mjs')
const args = process.argv.slice(2)
try {
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(process.execPath, [vitestEntrypoint, ...args], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      resolveExit(code ?? (signal ? 1 : 0))
    })
  })
  process.exitCode = exitCode
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
