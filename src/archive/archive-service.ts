import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { companyManifestSchema, type CompanyManifest } from '../domain/company.js'
import { migrateDatabase } from './migrations.js'

const DOCUMENT_CATEGORIES = ['filings', 'earnings', 'analyst', 'media', 'curated', 'other'] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export interface ArchiveConfig { root: string }

export interface ArtifactMetadata {
  sourceId: string
  artifactId?: string
  artifactKind: 'original' | 'curated' | 'extracted' | 'transformed'
  mediaType: string
  category: DocumentCategory
  fileName?: string
  originalRetained: boolean
  transformationMethod?: 'manual_edit' | 'ai_assisted_manual_edit' | 'html_to_markdown' | 'ocr' | 'parser' | 'other'
}

export interface StoredArtifact {
  artifactId: string
  localPath: string
  sha256: string
  size: number
}

export interface OpenCompany {
  path: string
  manifest: CompanyManifest
  databasePath: string
}

declare module 'cordis' {
  interface Context { equityArchive: EquityArchive }
}

export class EquityArchive {
  readonly root: string

  constructor(config: ArchiveConfig) {
    this.root = resolve(config.root)
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true })
  }

  async listCompanies(): Promise<CompanyManifest[]> {
    const entries = await readdir(this.root, { withFileTypes: true })
    const manifests: CompanyManifest[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      try { manifests.push(await this.readManifest(entry.name)) } catch { /* Ignore non-company directories. */ }
    }
    return manifests.sort((a, b) => a.company_id.localeCompare(b.company_id))
  }

  companyPath(companyId: string): string {
    assertCompanyId(companyId)
    return join(this.root, companyId)
  }

  async createCompany(input: CompanyManifest): Promise<OpenCompany> {
    const manifest = companyManifestSchema.parse(input)
    const companyPath = this.companyPath(manifest.company_id)
    try {
      await stat(companyPath)
      throw new Error(`Company workspace already exists: ${manifest.company_id}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    await mkdir(companyPath)
    await Promise.all([
      ...DOCUMENT_CATEGORIES.map((category) => mkdir(join(companyPath, 'documents', category), { recursive: true })),
      mkdir(join(companyPath, 'exports'), { recursive: true }),
    ])
    await this.writeManifest(manifest.company_id, manifest)
    this.withDatabase(manifest.company_id, (database) => {
      const now = new Date().toISOString()
      database.prepare(`INSERT INTO companies (
        company_id, name_zh, name_en, jurisdiction, accounting_standard, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        manifest.company_id, manifest.name_zh ?? null, manifest.name_en ?? null,
        manifest.jurisdiction, manifest.accounting_standard, now, now,
      )
    })
    return this.openCompany(manifest.company_id)
  }

  async openCompany(companyId: string): Promise<OpenCompany> {
    const manifest = await this.readManifest(companyId)
    if (manifest.company_id !== companyId) {
      throw new Error(`Manifest company_id does not match workspace directory: ${companyId}`)
    }
    this.withDatabase(companyId, () => undefined)
    return {
      path: this.companyPath(companyId),
      manifest,
      databasePath: join(this.companyPath(companyId), 'company.sqlite'),
    }
  }

  async readManifest(companyId: string): Promise<CompanyManifest> {
    const content = await readFile(join(this.companyPath(companyId), 'company.json'), 'utf8')
    return companyManifestSchema.parse(JSON.parse(content))
  }

  async writeManifest(companyId: string, input: CompanyManifest): Promise<void> {
    const manifest = companyManifestSchema.parse(input)
    if (manifest.company_id !== companyId) throw new Error('company_id is immutable within a workspace')
    const manifestPath = join(this.companyPath(companyId), 'company.json')
    const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, manifestPath)
  }

  withDatabase<T>(companyId: string, callback: (database: DatabaseSync) => T): T {
    const database = new DatabaseSync(join(this.companyPath(companyId), 'company.sqlite'))
    try {
      database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
      migrateDatabase(database)
      return callback(database)
    } finally {
      database.close()
    }
  }

  async storeArtifact(
    companyId: string,
    content: string | Uint8Array | { sourcePath: string },
    metadata: ArtifactMetadata,
  ): Promise<StoredArtifact> {
    const artifactId = metadata.artifactId ?? randomUUID()
    assertIdentifier(artifactId, 'artifactId')
    const extension = metadata.fileName ? extname(metadata.fileName) : ''
    const safeName = metadata.fileName ? sanitizeFileName(metadata.fileName) : `${artifactId}${extension}`
    const relativePath = join('documents', metadata.category, `${artifactId}-${safeName}`)
    const destination = join(this.companyPath(companyId), relativePath)
    await mkdir(dirname(destination), { recursive: true })

    const existing = this.withDatabase(companyId, (database) => database.prepare(
      'SELECT artifact_id FROM source_artifacts WHERE artifact_id = ?',
    ).get(artifactId))
    if (existing) throw new Error(`Artifact already exists: ${artifactId}`)

    if (typeof content === 'object' && 'sourcePath' in content) await copyFile(content.sourcePath, destination)
    else await writeFile(destination, content)

    const bytes = await readFile(destination)
    const sha256 = this.computeArtifactHash(bytes)
    try {
      this.withDatabase(companyId, (database) => {
        database.prepare(`INSERT INTO source_artifacts (
          artifact_id, source_id, artifact_kind, media_type, local_path, sha256,
          original_retained, transformation_method, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          artifactId, metadata.sourceId, metadata.artifactKind, metadata.mediaType,
          relativePath.split(sep).join('/'), sha256, metadata.originalRetained ? 1 : 0,
          metadata.transformationMethod ?? null, new Date().toISOString(),
        )
      })
    } catch (error) {
      await unlink(destination).catch(() => undefined)
      throw error
    }
    return { artifactId, localPath: relativePath.split(sep).join('/'), sha256, size: bytes.byteLength }
  }

  async resolveArtifact(companyId: string, artifactId: string): Promise<string> {
    assertIdentifier(artifactId, 'artifactId')
    const row = this.withDatabase(companyId, (database) => database.prepare(
      'SELECT local_path FROM source_artifacts WHERE artifact_id = ?',
    ).get(artifactId) as { local_path: string } | undefined)
    if (!row) throw new Error(`Unknown artifact: ${artifactId}`)
    const workspace = this.companyPath(companyId)
    const artifactPath = resolve(workspace, row.local_path)
    if (!isWithin(workspace, artifactPath)) throw new Error(`Artifact path escapes workspace: ${row.local_path}`)
    return artifactPath
  }

  async verifyArtifact(companyId: string, artifactId: string): Promise<boolean> {
    const artifactPath = await this.resolveArtifact(companyId, artifactId)
    const expected = this.withDatabase(companyId, (database) => database.prepare(
      'SELECT sha256 FROM source_artifacts WHERE artifact_id = ?',
    ).get(artifactId) as { sha256: string }).sha256
    return this.computeArtifactHash(await readFile(artifactPath)) === expected
  }

  computeArtifactHash(content: Uint8Array | string): string {
    return createHash('sha256').update(content).digest('hex')
  }
}

function assertCompanyId(companyId: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companyId)) throw new Error(`Invalid company_id: ${companyId}`)
}

function assertIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`Invalid ${field}: ${value}`)
}

function sanitizeFileName(fileName: string): string {
  const safe = basename(fileName).replace(/[^A-Za-z0-9._-]+/g, '-')
  if (!safe || safe === '.' || safe === '..') throw new Error(`Invalid artifact file name: ${fileName}`)
  return safe
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child))
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}
