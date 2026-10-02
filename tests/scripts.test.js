// Runs the two scripts against this machine.
const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const { spawn, spawnSync } = require("node:child_process")

const script = name => path.join(__dirname, "..", "scripts", name)
const run = (name, ...args) => spawnSync(script(name), args, { encoding: "utf8" })

test("heat-status --brief prints the sensor readings and CPU counters", () => {
  const result = run("heat-status", "--brief")
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.ok(report.cpuTemp === null || (report.cpuTemp > 0 && report.cpuTemp < 130))
  assert.ok(report.cpuTotal > report.cpuBusy && report.cpuBusy > 0)
  assert.ok("gpu" in report && "ssdTemp" in report)
})

test("brief readings are shared for a moment and refreshed afterwards", async () => {
  const first = run("heat-status", "--brief").stdout
  assert.equal(run("heat-status", "--brief").stdout, first, "a second caller gets the cached reading")
  await new Promise(resolve => setTimeout(resolve, 3100))
  assert.notEqual(JSON.parse(run("heat-status", "--brief").stdout).cpuTotal, JSON.parse(first).cpuTotal)
})

test("without a runtime directory nothing is cached", () => {
  const options = { encoding: "utf8", env: { PATH: process.env.PATH } }
  const a = JSON.parse(spawnSync(script("heat-status"), ["--brief"], options).stdout)
  const b = JSON.parse(spawnSync(script("heat-status"), ["--brief"], options).stdout)
  assert.ok(b.cpuTotal > a.cpuTotal)
})

test("heat-status reports sensors, profile and the busiest processes", () => {
  const result = run("heat-status")
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.ok(report.cores >= 1)
  assert.ok(report.load >= 0 && report.load <= 100)
  assert.ok(Array.isArray(report.profile.available))
  assert.ok(report.processes.length > 0 && report.processes.length <= 6)
  for (const p of report.processes) {
    assert.ok(Number.isInteger(p.pid) && p.pid > 0)
    assert.equal(typeof p.name, "string")
    assert.equal(typeof p.mine, "boolean")
    assert.ok(p.cpu >= 0)
  }
  const shares = report.processes.map(p => p.cpu)
  assert.deepEqual(shares, [...shares].sort((a, b) => b - a), "busiest first")
})

test("heat-end only accepts a process id", () => {
  for (const bad of ["", "abc", "-1", "0", "12; rm -rf x", "1 2"]) {
    assert.equal(run("heat-end", bad).status, 2, JSON.stringify(bad))
  }
})

test("heat-end leaves other users' processes alone", () => {
  if (process.getuid() === 0) return
  const result = run("heat-end", "1")
  assert.equal(result.status, 1)
  assert.match(result.stderr, /another user/)
})

test("heat-end asks one of your own processes to quit", async () => {
  const child = spawn("sleep", ["300"])
  const exited = new Promise(resolve => child.on("exit", (code, signal) => resolve(signal)))
  assert.equal(run("heat-end", String(child.pid)).status, 0)
  assert.equal(await exited, "SIGTERM")
  assert.equal(run("heat-end", String(child.pid)).status, 0, "a process that is gone is not an error")
})
