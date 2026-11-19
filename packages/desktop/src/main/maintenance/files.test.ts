import { afterEach, describe, expect, test } from "bun:test"
import { DatabaseSync } from "node:sqlite"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { clearUserData, copyTree, secretFiles, serverPattern, servicePort, writeServicePort } from "./files"

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

describe("serverPattern", () => {
  const cliRoot = "/home/tekalu/.config/ai.opencode.desktop/cli"

  // pkill -f matches the whole command line, so the pattern decides which processes a wipe signals.
  const matches = (commandLine: string, root = cliRoot) => new RegExp(serverPattern(root)).test(commandLine)

  test.each([
    {
      name: "the server staged in this profile",
      commandLine: `${cliRoot}/2.3.4-x64/opencode-cli serve --service`,
      expected: true,
    },
    {
      name: "a server staged by another TekuCode profile",
      commandLine: "/tmp/tekucode-234-test/desktop/cli/2.3.4-x64/opencode-cli serve --service",
      expected: false,
    },
    {
      name: "an Electron utility process whose command line contains the app path",
      commandLine:
        "/opt/TekuCode/ai.opencode --type=utility --utility-sub-type=network.mojom.NetworkService --lang=en-US --service-sandbox-type=none --shared-files",
      expected: false,
    },
    {
      name: "the desktop binary itself",
      commandLine: "/opt/TekuCode/ai.opencode",
      expected: false,
    },
    {
      name: "the staged CLI running anything but serve",
      commandLine: `${cliRoot}/2.3.4-x64/opencode-cli --version`,
      expected: false,
    },
    {
      name: "a sibling directory that only shares the prefix",
      commandLine: `${cliRoot}-other/2.3.4-x64/opencode-cli serve --service`,
      expected: false,
    },
  ])("$name", ({ commandLine, expected }) => {
    expect(matches(commandLine)).toBe(expected)
  })

  test("escapes regular expression characters in the profile path", () => {
    expect(serverPattern("/home/u/.local (test)/cli")).toBe(
      "^/home/u/\\.local \\(test\\)/cli/[^ ]*/opencode-cli serve( |$)",
    )
  })
})

describe("servicePort", () => {
  test("round-trips the port through a config the wipe removed", async () => {
    const directory = await root()
    const file = join(directory, "config", "service.json")

    await writeServicePort(file, 49375)

    expect(await servicePort(file)).toBe(49375)
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ port: 49375 })
  })

  test.each([
    { name: "a missing file", content: undefined },
    { name: "malformed JSON", content: "{" },
    { name: "a file without a port", content: '{"hostname":"127.0.0.1"}' },
    { name: "a port that is not an integer", content: '{"port":"49375"}' },
  ])("returns undefined for $name", async ({ content }) => {
    const directory = await root()
    const file = join(directory, "service.json")
    if (content !== undefined) await writeFile(file, content)

    expect(await servicePort(file)).toBeUndefined()
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
