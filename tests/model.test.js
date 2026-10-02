// Run with: node --test tests/
const test = require("node:test")
const assert = require("node:assert/strict")
const Model = require("../Model.js")

const report = {
  cpuTemp: 88, ssdTemp: 52,
  gpu: { name: "NVIDIA GeForce RTX 2070", temp: 62, load: 15, watts: 29 },
  profile: { active: "performance", available: ["performance", "balanced", "power-saver"] },
  cores: 12, load: 99,
  processes: [
    { pid: 2061185, name: "ffmpeg", detail: "in a container", cpu: 662, mine: false },
    { pid: 696135, name: "chrome", detail: "tab or extension", cpu: 49, mine: true },
    { pid: 1049, name: "tailscaled", detail: "", cpu: 35, mine: false },
    { pid: 2172, name: "immich-api", detail: "", cpu: 33, mine: false },
    { pid: 99, name: "idle", detail: "", cpu: 2, mine: true }
  ]
}

test("parse keeps the report and survives broken input", () => {
  const status = Model.parse(JSON.stringify(report))
  assert.equal(status.cpuTemp, 88)
  assert.equal(status.profile, "performance")
  assert.deepEqual(status.profiles, ["performance", "balanced", "power-saver"])
  assert.equal(status.processes.length, 5)
  assert.equal(status.processes[0].mine, false)
  assert.equal(Model.parse(""), null)
  assert.equal(Model.parse("not json"), null)
  assert.equal(Model.parse("[]").processes.length, 0)
})

test("parse tolerates missing sensors and tools", () => {
  const status = Model.parse(JSON.stringify({
    cpuTemp: null, ssdTemp: null, gpu: null, profile: { active: null, available: [] },
    cores: 4, load: 3, processes: [{ pid: "x" }, null, { pid: 7, name: "a", cpu: "5" }]
  }))
  assert.equal(status.cpuTemp, null)
  assert.equal(status.gpu, null)
  assert.equal(status.profile, "")
  assert.deepEqual(status.processes, [{ pid: 7, name: "a", detail: "", cpu: 0, mine: false }])
  assert.equal(Model.headline(status, 85), "No temperature sensor found")
  assert.equal(Model.temperature(status.cpuTemp), "–")
})

test("level and headline follow the user's hot threshold", () => {
  assert.equal(Model.level(88, 85), "hot")
  assert.equal(Model.level(70, 85), "warm")
  assert.equal(Model.level(64, 85), "cool")
  assert.equal(Model.level(88, 95), "warm")
  assert.equal(Model.headline(Model.parse(JSON.stringify(report)), 85), "Running hot")
  assert.equal(Model.headline(null, 85), "Measuring…")
})

test("cpu share switches to cores for heavy processes", () => {
  assert.equal(Model.cpuShare(49), "49%")
  assert.equal(Model.cpuShare(149), "149%")
  assert.equal(Model.cpuShare(662), "6.6 cores")
})

test("profiles are offered from quiet to fast", () => {
  assert.deepEqual(Model.profileOptions(["performance", "balanced", "power-saver"]),
    ["power-saver", "balanced", "performance"])
  assert.deepEqual(Model.profileOptions(["custom", "balanced"]), ["balanced", "custom"])
  assert.equal(Model.profileLabel("power-saver"), "Quiet")
  assert.equal(Model.profileLabel("custom"), "custom")
})

test("reasons name the busiest processes, the graphics card and the profile", () => {
  assert.deepEqual(Model.reasons(Model.parse(JSON.stringify(report))), [
    "ffmpeg · in a container keeps 6.6 cores busy",
    "chrome · tab or extension uses 49% of a core",
    "tailscaled uses 35% of a core",
    "Graphics card draws 29 W",
    "Performance profile: full processor speed"
  ])
})

test("reasons stay honest on a quiet or evenly busy machine", () => {
  const quiet = Model.parse(JSON.stringify({ ...report, load: 4, gpu: null,
    profile: { active: "balanced", available: [] }, processes: [{ pid: 5, name: "a", cpu: 3 }] }))
  assert.deepEqual(Model.reasons(quiet), ["Nothing stands out. The fans follow the temperature."])

  const busy = Model.parse(JSON.stringify({ ...report, load: 70, gpu: { name: "x", temp: 50, load: 40, watts: null },
    profile: { active: "balanced", available: [] }, processes: [{ pid: 5, name: "a", cpu: 20 }] }))
  assert.deepEqual(Model.reasons(busy), [
    "Many small tasks keep the processor 70% busy",
    "Graphics card is 40% busy"
  ])
  assert.deepEqual(Model.reasons(null), [])
})
