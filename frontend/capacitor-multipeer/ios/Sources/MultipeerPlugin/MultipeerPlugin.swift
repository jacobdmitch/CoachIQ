import Foundation
import Capacitor

/// Capacitor bridge exposing the Multipeer session to JavaScript as `Multipeer`.
///
/// JS API (see src/index.js):
///   startHost({ room })   -> become the authority, advertise the room
///   startGuest({ room })  -> browse + auto-join a nearby host
///   stop()
///   send({ data })        -> broadcast a JSON string to all peers
///   getStatus()           -> { role, room, peers }
///
/// Events (addListener): "peerConnected", "peerDisconnected", "message",
/// "peerConnecting", "peerLost", "hostingStarted", "browsingStarted".
@objc(MultipeerPlugin)
public class MultipeerPlugin: CAPPlugin, CAPBridgedPlugin, MultipeerManagerDelegate {
    public let identifier = "MultipeerPlugin"
    public let jsName = "Multipeer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startHost", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startGuest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
    ]

    private lazy var manager: MultipeerManager = {
        let m = MultipeerManager()
        m.delegate = self
        return m
    }()

    @objc func startHost(_ call: CAPPluginCall) {
        let room = call.getString("room") ?? ""
        manager.startHosting(roomCode: room)
        call.resolve(["role": "host", "room": room])
    }

    @objc func startGuest(_ call: CAPPluginCall) {
        let room = call.getString("room") ?? ""
        manager.startBrowsing(roomCode: room)
        call.resolve(["role": "guest", "room": room])
    }

    @objc func stop(_ call: CAPPluginCall) {
        manager.stop()
        call.resolve()
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let text = call.getString("data") else {
            call.reject("data (a JSON string) is required")
            return
        }
        call.resolve(["sent": manager.send(text: text)])
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        call.resolve(["role": manager.role, "room": manager.roomCode, "peers": manager.connectedPeerNames])
    }

    // MARK: - MultipeerManagerDelegate
    func multipeer(peerChanged peerName: String, connected: Bool) {
        notifyListeners(connected ? "peerConnected" : "peerDisconnected",
                        data: ["peer": peerName, "peers": manager.connectedPeerNames])
    }

    func multipeer(didReceive text: String, from peerName: String) {
        notifyListeners("message", data: ["data": text, "peer": peerName])
    }

    func multipeer(event: String, info: [String: Any]) {
        notifyListeners(event, data: info)
    }
}
