import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

interface PackageInfo {
  name: string
  versions?: string[]
  paths?: string[]
  license?: string
  author?: unknown
  homepage?: string
  description?: string
}

export interface LicenseNotice {
  name: string
  version: string
  license: string
  author: string
  repository: string
  description: string
  licenseText: string
}

function cleanString(val: unknown): string {
  if (!val) return ''
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>
    if (obj.name && typeof obj.name === 'string') {
      let str = obj.name
      if (obj.email && typeof obj.email === 'string') str += ` <${obj.email}>`
      if (obj.url && typeof obj.url === 'string') str += ` (${obj.url})`
      return str
    }
    if (obj.url && typeof obj.url === 'string') return obj.url
  }
  return String(val).trim()
}

function cleanRepo(val: unknown): string {
  if (!val) return ''
  let repo = ''
  if (typeof val === 'string') {
    repo = val
  } else if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>
    if (typeof obj.url === 'string') {
      repo = obj.url
    }
  }

  return repo
    .trim()
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
    .replace(/^git@github\.com:/, 'https://github.com/')
}

export function generateLicenses(): LicenseNotice[] {
  const rootPkgPath = path.join(rootDir, 'package.json')
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8')) as {
    name?: string
  }
  const rootPkgName = rootPkg.name || 'lunumia'

  // Extract production dependencies using corepack pnpm
  const pnpmOutput = execSync('corepack pnpm licenses list --prod --json', {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 15 * 1024 * 1024,
  })

  const licensesMap = JSON.parse(pnpmOutput) as Record<string, PackageInfo[]>
  const noticesMap = new Map<string, LicenseNotice>()

  for (const [licenseType, packages] of Object.entries(licensesMap)) {
    for (const pkg of packages) {
      if (!pkg.name || pkg.name === rootPkgName) continue

      const version =
        pkg.versions && pkg.versions.length > 0 ? pkg.versions[0]! : 'unknown'
      const dedupeKey = `${pkg.name}@${version}`

      let author = cleanString(pkg.author)
      let repository = cleanRepo(pkg.homepage)
      let description = cleanString(pkg.description)
      let licenseText = ''

      if (pkg.paths && pkg.paths[0]) {
        const pkgDir = pkg.paths[0]
        try {
          const innerPkgJsonPath = path.join(pkgDir, 'package.json')
          if (fs.existsSync(innerPkgJsonPath)) {
            const innerPkg = JSON.parse(
              fs.readFileSync(innerPkgJsonPath, 'utf8'),
            ) as Record<string, unknown>
            if (!author && innerPkg.author) {
              author = cleanString(innerPkg.author)
            }
            if (innerPkg.repository) {
              repository = cleanRepo(innerPkg.repository)
            }
            if (!description && innerPkg.description) {
              description = cleanString(innerPkg.description)
            }
          }

          if (fs.existsSync(pkgDir)) {
            const files = fs.readdirSync(pkgDir)
            const licFile = files.find((f) =>
              /^(licen[sc]e|copying|notice)(\.|$)/i.test(f),
            )
            if (licFile) {
              licenseText = fs
                .readFileSync(path.join(pkgDir, licFile), 'utf8')
                .trim()
            }
          }
        } catch (err) {
          console.warn(`Warning reading metadata for ${pkg.name}:`, err)
        }
      }

      // If licenseText is still missing, search in parent packages or provide fallback notice
      if (!licenseText) {
        // Many scoped platform binary packages (like @napi-rs/canvas-win32-x64-msvc)
        // inherit license from the main package (@napi-rs/canvas)
        const parentPkgName = pkg.name.replace(
          /-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/,
          '',
        )
        if (parentPkgName !== pkg.name) {
          const parentEntry = Array.from(noticesMap.values()).find(
            (n) => n.name === parentPkgName,
          )
          if (parentEntry?.licenseText) {
            licenseText = parentEntry.licenseText
          }
        }
      }

      if (!licenseText) {
        licenseText = `Licensed under the ${pkg.license || licenseType} license.`
      }

      noticesMap.set(dedupeKey, {
        name: pkg.name,
        version,
        license: pkg.license || licenseType,
        author,
        repository,
        description,
        licenseText,
      })
    }
  }

  const result = Array.from(noticesMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  return result
}

function run() {
  const notices = generateLicenses()
  const content = JSON.stringify(notices, null, 2) + '\n'

  const appPublicPath = path.join(rootDir, 'public', 'licenses.json')
  const landingPublicPath = path.join(
    rootDir,
    'landing',
    'public',
    'licenses.json',
  )

  fs.mkdirSync(path.dirname(appPublicPath), { recursive: true })
  fs.mkdirSync(path.dirname(landingPublicPath), { recursive: true })

  fs.writeFileSync(appPublicPath, content, 'utf8')
  fs.writeFileSync(landingPublicPath, content, 'utf8')

  console.log(
    `Successfully generated licenses.json with ${notices.length} packages:`,
  )
  console.log(` - ${appPublicPath}`)
  console.log(` - ${landingPublicPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run()
}
