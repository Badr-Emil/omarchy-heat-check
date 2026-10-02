import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "io.github.badr-emil.heat-check"
  ipcTarget: "io.github.badr-emil.heat-check"

  property var status: null
  property var barTemp: null
  property int cursor: -1
  property int confirmPid: 0
  property string error: ""

  readonly property string pluginPath: decodeURIComponent(
    Qt.resolvedUrl(".").toString().replace(/^file:\/\//, "")
  )
  readonly property int hotAt: Math.max(50, Math.min(105, Number(setting("hotAt", 85)) || 85))
  readonly property int refreshInterval: Math.max(5, Number(setting("refreshIntervalSec", 10)) || 10) * 1000
  readonly property bool hideWhenCool: setting("hideWhenCool", false) === true

  readonly property var shownTemp: status ? status.cpuTemp : barTemp
  readonly property bool hot: Model.level(shownTemp, hotAt) === "hot"
  readonly property var processes: status ? status.processes : []
  readonly property var reasons: Model.reasons(status)

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  function script(name) {
    return root.pluginPath + "scripts/" + name
  }

  function refresh() {
    if (!statusProcess.running) statusProcess.running = true
  }

  function applyStatus(output) {
    var parsed = Model.parse(output)
    if (!parsed) return
    status = parsed
    barTemp = parsed.cpuTemp
    cursor = Math.min(cursor, processes.length - 1)
  }

  function applyBrief(output) {
    var parsed = Model.parse(output)
    if (parsed) barTemp = parsed.cpuTemp
  }

  function setProfile(profile) {
    if (!status || profile === status.profile) return
    error = ""
    profileProcess.command = ["powerprofilesctl", "set", profile]
    profileProcess.running = true
  }

  function shiftProfile(step) {
    if (!status) return
    var options = Model.profileOptions(status.profiles)
    var index = options.indexOf(status.profile) + step
    if (index >= 0 && index < options.length) setProfile(options[index])
  }

  // Ending a program loses whatever is unsaved in it, so it takes two presses.
  function end(pid) {
    if (endProcess.running) return
    if (confirmPid !== pid) {
      confirmPid = pid
      confirmTimer.restart()
      return
    }
    confirmPid = 0
    error = ""
    endProcess.command = [script("heat-end"), String(pid)]
    endProcess.running = true
  }

  function moveCursor(step) {
    if (processes.length === 0) return
    cursor = Math.max(0, Math.min(processes.length - 1, cursor + step))
    confirmPid = 0
  }

  onOpenedChanged: {
    if (opened) {
      error = ""
      cursor = -1
      confirmPid = 0
      refresh()
    }
  }

  visible: !hideWhenCool || hot || opened
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // The full report watches the processes for a second, so it only runs while
  // the panel is open. The bar icon needs nothing but the temperature.
  Process {
    id: statusProcess
    command: [root.script("heat-status")]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyStatus(text)
    }
    onExited: if (root.opened) pause.restart()
  }

  Process {
    id: briefProcess
    command: [root.script("heat-status"), "--brief"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyBrief(text)
    }
  }

  Process {
    id: profileProcess
    stderr: StdioCollector { id: profileErrors; waitForEnd: true }
    onExited: function(exitCode) {
      if (exitCode !== 0) root.error = String(profileErrors.text).trim() || "Could not change the power profile"
      root.refresh()
    }
  }

  Process {
    id: endProcess
    stderr: StdioCollector { id: endErrors; waitForEnd: true }
    onExited: function(exitCode) {
      if (exitCode !== 0) root.error = String(endErrors.text).trim() || "Could not end the program"
      root.refresh()
    }
  }

  Timer {
    id: pause
    interval: 2000
    onTriggered: if (root.opened) root.refresh()
  }

  Timer {
    interval: root.refreshInterval
    running: !root.opened
    repeat: true
    triggeredOnStart: true
    onTriggered: if (!briefProcess.running) briefProcess.running = true
  }

  Timer {
    id: confirmTimer
    interval: 4000
    onTriggered: root.confirmPid = 0
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰈐"
    active: root.hot
    tooltipText: root.opened ? "" : "Processor " + Model.temperature(root.shownTemp) + "C"
      + (root.hot ? "\nRunning hot. Click to see why." : "")
    onPressed: function(b) { root.toggle() }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(400))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) {
        if (dy !== 0) root.moveCursor(dy)
        else root.shiftProfile(dx)
      }
      onDeleteRequested: {
        var p = root.processes[root.cursor]
        if (p && p.mine) root.end(p.pid)
      }
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: column
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        spacing: Style.space(12)

        // ---------- Hero: icon · title/status ----------
        Item {
          width: parent.width
          implicitHeight: Math.max(heroIcon.implicitHeight, heroLabels.implicitHeight)

          Text {
            id: heroIcon
            textFormat: Text.PlainText
            text: "󰈐"
            color: root.hot ? root.urgent : root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.display
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
          }

          Column {
            id: heroLabels
            anchors.left: heroIcon.right
            anchors.leftMargin: Style.space(14)
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            Text {
              text: "Heat Check"
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
              elide: Text.ElideRight
              width: parent.width
            }

            Text {
              textFormat: Text.PlainText
              text: Model.headline(root.status, root.hotAt).toUpperCase()
              color: root.hot ? root.urgent : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1.2
              elide: Text.ElideRight
              width: parent.width
            }
          }
        }

        // ---------- Temperatures ----------
        Row {
          id: temps
          width: parent.width
          spacing: Style.space(8)

          readonly property var tiles: {
            var s = root.status
            var list = [{ icon: "󰘚", label: "Processor", temp: s ? s.cpuTemp : root.barTemp, hot: root.hot }]
            if (s && s.gpu) list.push({ icon: "󰢮", label: "Graphics", temp: s.gpu.temp, hot: false })
            if (s && s.ssdTemp !== null) list.push({ icon: "󰋊", label: "Drive", temp: s.ssdTemp, hot: false })
            return list
          }

          Repeater {
            model: temps.tiles

            Rectangle {
              required property var modelData
              width: (temps.width - temps.spacing * (temps.tiles.length - 1)) / temps.tiles.length
              height: tileColumn.implicitHeight + Style.space(16)
              radius: Style.cornerRadius
              color: Util.alpha(root.foreground, 0.05)
              border.width: 1
              border.color: Util.alpha(modelData.hot ? root.urgent : root.foreground, modelData.hot ? 0.7 : 0.12)

              Column {
                id: tileColumn
                anchors.centerIn: parent
                spacing: Style.space(2)

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  textFormat: Text.PlainText
                  text: Model.temperature(modelData.temp)
                  color: modelData.hot ? root.urgent : root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.display
                  font.bold: true
                }

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  textFormat: Text.PlainText
                  text: modelData.icon + "  " + modelData.label
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                }
              }
            }
          }
        }

        // ---------- Why ----------
        Column {
          width: parent.width
          spacing: Style.space(5)
          visible: root.reasons.length > 0

          PanelSectionHeader {
            text: "WHY THE FANS ARE WORKING"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }

          Repeater {
            model: root.reasons

            Text {
              required property string modelData
              width: parent.width
              textFormat: Text.PlainText
              text: "·  " + modelData
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              wrapMode: Text.Wrap
            }
          }
        }

        PanelSeparator { foreground: root.foreground; visible: root.processes.length > 0 }

        // ---------- Busiest programs ----------
        Column {
          width: parent.width
          spacing: Style.space(2)
          visible: root.processes.length > 0

          PanelSectionHeader {
            text: "BUSIEST PROGRAMS"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }

          Repeater {
            model: root.processes

            Rectangle {
              id: row
              required property var modelData
              required property int index
              readonly property bool confirming: root.confirmPid === modelData.pid
              width: parent.width
              height: Style.spacing.controlHeight
              radius: Math.min(Style.cornerRadius, Style.space(4))
              color: root.cursor === index ? Style.selectedAccentFill : "transparent"

              Text {
                anchors.left: parent.left
                anchors.leftMargin: Style.space(6)
                anchors.right: share.left
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                textFormat: Text.PlainText
                text: Model.processLabel(row.modelData)
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                elide: Text.ElideRight
              }

              Text {
                id: share
                anchors.right: endButton.left
                anchors.rightMargin: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                textFormat: Text.PlainText
                text: Model.cpuShare(row.modelData.cpu)
                color: row.modelData.cpu >= 100 ? root.urgent : root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
                font.bold: row.modelData.cpu >= 100
              }

              Button {
                id: endButton
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(64)
                enabled: row.modelData.mine
                opacity: enabled ? 1 : 0.3
                text: row.confirming ? "Sure?" : "End"
                tooltipText: !row.modelData.mine ? "Runs as another user (system service or container)"
                  : row.confirming ? "Press again to end it. Unsaved work in it is lost."
                  : "Ask this program to quit"
                foreground: row.confirming ? root.urgent : root.foreground
                fontFamily: root.fontFamily
                fontSize: Style.font.caption
                verticalPadding: Style.space(3)
                bordered: true
                onClicked: root.end(row.modelData.pid)
              }
            }
          }
        }

        // ---------- Power profile ----------
        Column {
          width: parent.width
          spacing: Style.space(6)
          visible: root.status !== null && root.status.profiles.length > 1

          PanelSeparator { foreground: root.foreground }

          PanelSectionHeader {
            text: "POWER PROFILE"
            foreground: root.foreground
            fontFamily: root.fontFamily
          }

          ButtonGroup {
            readonly property var icons: ({ "power-saver": "󰌪", "balanced": "󰗑", "performance": "󰑣" })
            options: root.status ? Model.profileOptions(root.status.profiles).map(function(p) {
              return { value: p, label: Model.profileLabel(p), icon: icons[p] || "" }
            }) : []
            value: root.status ? root.status.profile : ""
            foreground: root.foreground
            fontFamily: root.fontFamily
            focusable: false
            onChanged: function(value) { root.setProfile(value) }
          }
        }

        Text {
          width: parent.width
          visible: root.error !== ""
          textFormat: Text.PlainText
          text: root.error
          color: root.urgent
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.Wrap
        }

        Text {
          width: parent.width
          text: "↑ ↓ choose a program · x end it · ← → power profile"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          horizontalAlignment: Text.AlignHCenter
          elide: Text.ElideRight
        }
      }
    }
  }
}
