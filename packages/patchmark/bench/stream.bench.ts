// Streaming-parse cost, in the shape the renderer pays it: one `update` per delta while a session
// is live. Run with `bun run bench/stream.bench.ts` from this package. No framework: the numbers are
// only useful relative to each other, and a plain timer keeps the measurement out of the tooling.

import { createMarkdownStream } from "../src/stream"

function response(paragraphs: number) {
  return Array.from(
    { length: paragraphs },
    (_, index) =>
      `## Step ${index + 1}\n\n` +
      `The parser keeps an eye on the tail block and re-parses only what a delta can change, so ` +
      `a paragraph like this one settles once the next blank line arrives and is never touched again. ` +
      `Inline code such as \`stream.update(text)\` stays cheap, and emphasis, links and entities ` +
      `resolve from the same pass.\n\n` +
      `- item ${index}\n- item ${index + 1}\n- item ${index + 2}\n\n` +
      `| column | value |\n| --- | --- |\n| index | ${index} |\n| status | streaming |\n\n` +
      "```ts\nconst stream = createMarkdownStream({ gfm: true, heal: true })\nconst frame = stream.update(text, { streaming: true })\n```\n\n",
  ).join("")
}

const options = { gfm: true, math: true, heal: true, holdPendingMarkers: false }
const document = response(24)

function chunks(size: number) {
  const parts: string[] = []

  for (let offset = 0; offset < document.length; offset += size) parts.push(document.slice(offset, offset + size))

  return parts
}

function time(runs: number, run: () => void) {
  const samples: number[] = []

  for (let index = 0; index < runs; index++) {
    const started = performance.now()
    run()
    samples.push(performance.now() - started)
  }

  samples.sort((a, b) => a - b)

  return { median: samples[Math.floor(samples.length / 2)]!, p95: samples[Math.floor(samples.length * 0.95)]! }
}

function report(name: string, updates: number, runs: number, run: () => void) {
  const { median, p95 } = time(runs, run)

  console.log(
    `${name.padEnd(38)} ${median.toFixed(2).padStart(8)} ms  p95 ${p95.toFixed(2).padStart(8)} ms  ` +
      `${(updates / median).toFixed(0).padStart(7)} updates/s  ${((median / updates) * 1000).toFixed(1).padStart(6)} µs/update`,
  )
}

console.log(`\ndocument: ${document.length.toLocaleString()} characters\n`)

report("per-token deltas (3 chars)", chunks(3).length, 20, () => {
  const stream = createMarkdownStream(options)
  for (const part of chunks(3)) stream.update(part, { streaming: true })
})

report("per-flush batches (30 chars)", chunks(30).length, 20, () => {
  const stream = createMarkdownStream(options)
  for (const part of chunks(30)) stream.update(part, { streaming: true })
})

report("one streaming update, whole document", 1, 40, () => {
  createMarkdownStream(options).update(document, { streaming: true })
})

report("one settled parse", 1, 40, () => {
  createMarkdownStream(options).update(document, { streaming: false })
})

console.log()
