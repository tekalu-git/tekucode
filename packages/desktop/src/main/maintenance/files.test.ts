import { afterEach, describe, expect, test } from "bun:test"
import { DatabaseSync } from "node:sqlite"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { clearUserData, copyTree, secretFiles } from "./files"

const roots: string[] = []

afterEach(() => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

const root = async () => {
  const directory = await mkdtemp(join(tmpdir(), "opencode-maintenance-"))
  roots.push(directory)

  return directory
}

const rows = (database: DatabaseSync, table: string) =>
  database.prepare(`SELECT count(*) AS count FROM "${table}"`).get()!.count

describe("clearUserData", () => {
  test("empties every data table but keeps the schema journal", () => {
    const file = join(process.env.TMPDIR ?? tmpdir(), `opencode-clear-${process.pid}-${Date.now()}.db`)
    roots.push(file)

    const seeded = new DatabaseSync(file)
    seeded.exec(`
      CREATE TABLE migration (id TEXT PRIMARY KEY);
      CREATE TABLE data_migration (id TEXT PRIMARY KEY);
      CREATE TABLE session_v2 (id TEXT PRIMARY KEY);
      CREATE TABLE credential (id TEXT PRIMARY KEY);
      CREATE TABLE kv (key TEXT PRIMARY KEY);
      CREATE TABLE project (id TEXT PRIMARY KEY);
      INSERT INTO migration VALUES ('one');
      INSERT INTO data_migration VALUES ('one');
      INSERT INTO session_v2 VALUES ('ses');
      INSERT INTO credential VALUES ('cred');
      INSERT INTO kv VALUES ('artifact');
      INSERT INTO project VALUES ('proj');
    `)
    seeded.close()

    clearUserData(file)

    const database = new DatabaseSync(file)
    try {
      expect(rows(database, "migration")).toBe(1)
      expect(rows(database, "data_migration")).toBe(1)
      expect(rows(database, "session_v2")).toBe(0)
      expect(rows(database, "credential")).toBe(0)
      expect(rows(database, "kv")).toBe(0)
      expect(rows(database, "project")).toBe(0)
    } finally {
      database.close()
    }
  })
})

describe("copyTree", () => {
  test("never copies auth or account files into or out of the snapshot", async () => {
    const directory = await root()
    const source = join(directory, "source")
    const target = join(directory, "target")

    await mkdir(join(source, "nested"), { recursive: true })
    await writeFile(join(source, "opencode.json"), "{}")
    await writeFile(join(source, "AGENTS.md"), "hello")
    await writeFile(join(source, "auth.json"), '{"token":"secret"}')
    await writeFile(join(source, "service-local.json"), '{"password":"secret"}')
    await writeFile(join(source, "nested", "accounts.json"), "[]")
    await writeFile(join(source, "nested", "skill.md"), "keep")

    await copyTree(source, target, secretFiles)

    expect(await readFile(join(target, "opencode.json"), "utf8")).toBe("{}")
    expect(await readFile(join(target, "AGENTS.md"), "utf8")).toBe("hello")
    expect(await readFile(join(target, "nested", "skill.md"), "utf8")).toBe("keep")
    expect(existsSync(join(target, "auth.json"))).toBe(false)
    expect(existsSync(join(target, "service-local.json"))).toBe(false)
    expect(existsSync(join(target, "nested", "accounts.json"))).toBe(false)
  })
})
