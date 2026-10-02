// Turns the report of scripts/heat-status into what the panel shows.

// A process counts as a heat source from this share of one CPU core.
var BUSY_PROCESS = 25
// Whole-machine load, in percent of all cores, that alone explains loud fans.
var BUSY_MACHINE = 50
var BUSY_GPU_WATTS = 20

function parse(raw) {
  var data = null
  try {
    data = raw ? JSON.parse(String(raw)) : null
  } catch (e) {
    data = null
  }
  if (!data || typeof data !== "object") return null

  var profile = data.profile || {}
  var processes = Array.isArray(data.processes) ? data.processes : []
  return {
    cpuTemp: number(data.cpuTemp),
    ssdTemp: number(data.ssdTemp),
    gpu: data.gpu && typeof data.gpu === "object" ? {
      name: String(data.gpu.name || "Graphics card"),
      temp: number(data.gpu.temp),
      load: number(data.gpu.load),
      watts: number(data.gpu.watts)
    } : null,
    profile: typeof profile.active === "string" ? profile.active : "",
    profiles: Array.isArray(profile.available) ? profile.available.map(String) : [],
    cores: number(data.cores) || 1,
    load: number(data.load) || 0,
    processes: processes.filter(function(p) { return p && number(p.pid) > 0 }).map(function(p) {
      return {
        pid: Number(p.pid),
        name: String(p.name || "?"),
        detail: String(p.detail || ""),
        cpu: number(p.cpu) || 0,
        mine: p.mine === true
      }
    })
  }
}

// The short report behind the bar text. `previous` is the report before it;
// the two CPU counters together give the load in between.
function parseBrief(raw, previous) {
  var data = null
  try {
    data = raw ? JSON.parse(String(raw)) : null
  } catch (e) {
    data = null
  }
  if (!data || typeof data !== "object") return null

  var brief = {
    cpuTemp: number(data.cpuTemp),
    ssdTemp: number(data.ssdTemp),
    gpuTemp: data.gpu && typeof data.gpu === "object" ? number(data.gpu.temp) : null,
    cpuBusy: number(data.cpuBusy),
    cpuTotal: number(data.cpuTotal),
    load: previous ? previous.load : null
  }
  if (previous && brief.cpuTotal !== null && previous.cpuTotal !== null && brief.cpuTotal > previous.cpuTotal) {
    var share = (brief.cpuBusy - previous.cpuBusy) * 100 / (brief.cpuTotal - previous.cpuTotal)
    brief.load = Math.max(0, Math.min(100, Math.round(share)))
  }
  return brief
}

function briefOf(status, previous) {
  return {
    cpuTemp: status.cpuTemp,
    ssdTemp: status.ssdTemp,
    gpuTemp: status.gpu ? status.gpu.temp : null,
    cpuBusy: previous ? previous.cpuBusy : null,
    cpuTotal: previous ? previous.cpuTotal : null,
    load: status.load
  }
}

// What the bar shows: one reading per sensor this machine has.
function barText(brief, icons, showLoad) {
  // Kept tight: on a laptop screen the bar's centre has little room.
  if (!brief) return icons.cpu + " –"
  var parts = [icons.cpu + " " + temperature(brief.cpuTemp)
    + (showLoad && brief.load !== null ? " " + brief.load + "%" : "")]
  if (brief.gpuTemp !== null) parts.push(icons.gpu + " " + temperature(brief.gpuTemp))
  if (brief.ssdTemp !== null) parts.push(icons.drive + " " + temperature(brief.ssdTemp))
  return parts.join(" ")
}

function number(value) {
  return typeof value === "number" && isFinite(value) ? value : null
}

function temperature(value) {
  return value === null || value === undefined ? "–" : Math.round(value) + "°"
}

// "cool", "warm" or "hot", relative to the temperature the user calls hot.
function level(temp, hotAt) {
  if (temp === null || temp === undefined) return "unknown"
  if (temp >= hotAt) return "hot"
  if (temp >= hotAt - 20) return "warm"
  return "cool"
}

function headline(status, hotAt) {
  if (!status) return "Measuring…"
  var state = level(status.cpuTemp, hotAt)
  if (state === "hot") return "Running hot"
  if (state === "warm") return "Warm"
  if (state === "cool") return "Cool"
  return "No temperature sensor found"
}

function processLabel(p) {
  return p.detail !== "" ? p.name + " · " + p.detail : p.name
}

// One CPU core is 100, so 662 reads better as "6.6 cores".
function cpuShare(cpu) {
  if (cpu >= 150) return (Math.round(cpu / 10) / 10) + " cores"
  return Math.round(cpu) + "%"
}

function cpuSentence(cpu) {
  return cpu >= 150 ? "keeps " + cpuShare(cpu) + " busy" : "uses " + cpuShare(cpu) + " of a core"
}

function profileLabel(profile) {
  if (profile === "power-saver") return "Quiet"
  if (profile === "balanced") return "Balanced"
  if (profile === "performance") return "Performance"
  return profile
}

// Quietest first, whatever order powerprofilesctl lists them in.
function profileOptions(profiles) {
  var order = ["power-saver", "balanced", "performance"]
  return profiles.slice().sort(function(a, b) {
    var ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib)
  })
}

// Plain sentences that explain why the fans are working, most important first.
function reasons(status) {
  if (!status) return []
  var list = []

  for (var i = 0; i < status.processes.length; i++) {
    var p = status.processes[i]
    if (p.cpu < BUSY_PROCESS || list.length >= 3) break
    list.push(processLabel(p) + " " + cpuSentence(p.cpu))
  }

  if (list.length === 0 && status.load >= BUSY_MACHINE) {
    list.push("Many small tasks keep the processor " + status.load + "% busy")
  }

  if (status.gpu && (status.gpu.watts >= BUSY_GPU_WATTS || status.gpu.load >= 30)) {
    list.push(status.gpu.watts !== null
      ? "Graphics card draws " + status.gpu.watts + " W"
      : "Graphics card is " + status.gpu.load + "% busy")
  }

  if (status.profile === "performance") {
    list.push("Performance profile: full processor speed")
  }

  if (list.length === 0) list.push("Nothing stands out. The fans follow the temperature.")
  return list
}

if (typeof module !== "undefined") {
  module.exports = {
    parse: parse,
    parseBrief: parseBrief,
    briefOf: briefOf,
    barText: barText,
    temperature: temperature,
    level: level,
    headline: headline,
    processLabel: processLabel,
    cpuShare: cpuShare,
    profileLabel: profileLabel,
    profileOptions: profileOptions,
    reasons: reasons
  }
}
