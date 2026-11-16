import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  importOrder,
  listBackups,
  pruneBackups,
  restoreSessions,
  trimSession,
  type BackupOptions,
  type SessionBackupClient,
} from "./sessions"

const roots: string[] = []

afterEach(() => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

const root = async () => {
  const directory = await mkdtemp(join(tmpdir(), "opencode-sessions-"))
  roots.push(directory)

  return directory
}

const backup = async (root: string, name: string, createdAt: number, sessions = 1) => {
  const path = join(root, name)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, "manifest.json"), JSON.stringify({ version: 1, createdAt, sessions, failed: [] }))

  return path
}

describe("importOrder", () => {
  test("a parent is imported before the children that name it", () => {
    const order = importOrder([
      { info: { id: "grandchild", parentID: "child" } },
      { info: { id: "child", parentID: "parent" } },
      { info: { id: "parent" } },
    ])

    expect(order.map((session) => session.info.id)).toEqual(["parent", "child", "grandchild"])
  })

  test("a parent cycle still imports every session", () => {
    const order = importOrder([
      { info: { id: "a", parentID: "b" } },
      { info: { id: "b", parentID: "a" } },
      { info: { id: "orphan", parentID: "missing" } },
    ])

    expect(order.map((session) => session.info.id).toSorted()).toEqual(["a", "b", "orphan"])
  })
})

describe("restore", () => {
  test("imports parents before children and skips conversations that already exist", async () => {
    const directory = await root()
    const path = await backup(directory, "backup-restore", 1_000, 3)
    await writeFile(
      join(path, "child.json"),
      JSON.stringify({ info: { id: "child", parentID: "parent" }, messages: [] }),
    )
    await writeFile(join(path, "parent.json"), JSON.stringify({ info: { id: "parent" }, messages: [] }))
    await writeFile(join(path, "already.json"), JSON.stringify({ info: { id: "already" }, messages: [] }))

    const imported: string[] = []

    const client: SessionBackupClient = {
      session: { list: async () => ({ data: [{ id: "already" }], cursor: { next: undefined } }) },
      experimental: {
        session: {
          export: async () => {
            throw new Error("export is not used by a restore")
          },
          import: async (input) => {
            if (input.info.parentID && !imported.includes(input.info.parentID))
              throw new Error(`parent ${input.info.parentID} was not imported first`)

            imported.push(input.info.id)

            return {}
          },
        },
      },
    }

    expect(await restoreSessions(client, path)).toEqual({ imported: 2, skipped: 1, failed: 0 })
    expect(imported).toEqual(["parent", "child"])
  })
})

describe("conversation backups on disk", () => {
  test("lists the complete runs newest first and ignores one without a manifest", async () => {
    const directory = await root()
    await backup(directory, "backup-old", 1_000)
    await backup(directory, "backup-new", 3_000)
    await mkdir(join(directory, "backup-interrupted"), { recursive: true })

    const backups = await listBackups(directory)

    expect(backups.map((entry) => entry.id)).toEqual(["backup-new", "backup-old"])
    expect(backups[0]?.count).toBe(1)
  })

  test("pruning keeps the newest runs and removes the rest", async () => {
    const directory = await root()
    await backup(directory, "backup-1", 1_000)
    await backup(directory, "backup-2", 2_000)
    await backup(directory, "backup-3", 3_000)

    await pruneBackups(directory, 2)

    expect((await listBackups(directory)).map((entry) => entry.id)).toEqual(["backup-3", "backup-2"])
  })
})

type FixtureMessage = {
  id: string
  type?: string
  metadata?: unknown
  native?: unknown
  files?: Array<{ name: string; data: string; source: Record<string, unknown> }>
  content?: Array<Record<string, unknown>>
  output?: Record<string, unknown>
}

type Fixture = {
  info: { id: string; title?: string; metadata?: unknown } & Record<string, unknown>
  messages: FixtureMessage[]
}

const transcript = (): Fixture => ({
  info: {
    id: "ses_1",
    projectID: "project_1",
    title: "A saved conversation",
    metadata: { tag: "x" },
    cost: 0,
    tokens: {},
    time: {},
    location: { directory: "/tmp/project" },
  },
  messages: [
    {
      id: "msg_1",
      type: "user",
      metadata: { displayText: "hi" },
      files: [{ name: "a.png", data: "aGk=", source: { type: "inline", path: "a.png" } }],
      content: [{ type: "text", text: "hi" }],
    },
    {
      id: "msg_2",
      type: "assistant",
      metadata: { provider: "x" },
      native: { providerKey: "x" },
      content: [
        { type: "text", text: "hello" },
        { type: "reasoning", text: "think", native: { reasoningField: "reasoning_content" } },
        {
          type: "tool",
          name: "shell",
          state: {
            status: "completed",
            content: [{ type: "text", text: "a very large result" }],
            metadata: { exit: 0 },
          },
        },
      ],
    },
    { id: "msg_3", type: "shell", output: { output: "a very large output" } },
  ],
})

const find = (data: Fixture, id: string) => data.messages.find((message) => message.id === id)!

// SAFETY: the fixture supplies exactly the fields trimSession reads and deletes; it is deliberately not
// a complete Session.Info because the server never sees these objects.
const trim = (data: Fixture, options: BackupOptions): Fixture => trimSession(data as never, options) as never

describe("trimSession", () => {
  test("keeps the whole transcript and leaves the caller's copy untouched by default", () => {
    const input = transcript()
    const output = trim(input, {})

    expect(output).toEqual(input)
    expect(output).not.toBe(input)
    expect(output.info.id).toBe("ses_1")
    expect(output.messages.map((message) => message.id)).toEqual(["msg_1", "msg_2", "msg_3"])
  })

  test("drops the optional data but keeps the IDs restore keys rows by", () => {
    const output = trim(transcript(), {
      toolOutput: false,
      reasoning: false,
      attachments: false,
      metadata: false,
    })

    expect(output.info.id).toBe("ses_1")
    expect(output.info.title).toBeUndefined()
    expect(output.info.metadata).toBeUndefined()
    expect(find(output, "msg_1")).toEqual({
      id: "msg_1",
      type: "user",
      files: [{ name: "a.png", data: "", source: { type: "inline" } }],
      content: [{ type: "text", text: "hi" }],
    })
    expect(find(output, "msg_2")).toEqual({
      id: "msg_2",
      type: "assistant",
      content: [
        { type: "text", text: "hello" },
        {
          type: "tool",
          name: "shell",
          state: { status: "completed", content: [{ type: "text", text: "[tool output omitted]" }] },
        },
      ],
    })
    expect(find(output, "msg_3")).toEqual({
      id: "msg_3",
      type: "shell",
      output: { output: "[shell output omitted]" },
    })
  })

  test("keeps the parts a caller leaves on", () => {
    const output = trim(transcript(), { metadata: false })

    expect(find(output, "msg_2")).toEqual({
      id: "msg_2",
      type: "assistant",
      content: [
        { type: "text", text: "hello" },
        { type: "reasoning", text: "think" },
        {
          type: "tool",
          name: "shell",
          state: {
            status: "completed",
            content: [{ type: "text", text: "a very large result" }],
            metadata: { exit: 0 },
          },
        },
      ],
    })
  })
})
