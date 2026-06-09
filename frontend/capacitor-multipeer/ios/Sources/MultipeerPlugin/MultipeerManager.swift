import Foundation
import MultipeerConnectivity

/// Wraps a single MCSession. Multipeer Connectivity transparently uses
/// Bluetooth and peer-to-peer / infrastructure Wi-Fi, so coaches connect with
/// no router and no internet. One device hosts (advertises), the others join
/// (browse + auto-invite). Host is the authority for game state.
protocol MultipeerManagerDelegate: AnyObject {
    func multipeer(peerChanged peerName: String, connected: Bool)
    func multipeer(didReceive text: String, from peerName: String)
    func multipeer(event: String, info: [String: Any])
}

final class MultipeerManager: NSObject {
    static let serviceType = "coachiq-lax" // 1-15 chars, a-z 0-9 and hyphen

    weak var delegate: MultipeerManagerDelegate?

    private let myPeerId: MCPeerID
    private let session: MCSession
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?

    private(set) var role: String = "idle" // "host" | "guest" | "idle"
    private(set) var roomCode: String = ""

    override init() {
        let name = UIDevice.current.name
        myPeerId = MCPeerID(displayName: String(name.prefix(63)))
        session = MCSession(peer: myPeerId, securityIdentity: nil, encryptionPreference: .required)
        super.init()
        session.delegate = self
    }

    var connectedPeerNames: [String] { session.connectedPeers.map { $0.displayName } }

    /// Start hosting under a room code (assistants browse for the same service
    /// and are auto-accepted; the code is advertised so the UI can show it).
    func startHosting(roomCode: String) {
        stop()
        role = "host"
        self.roomCode = roomCode
        let info = ["room": roomCode, "role": "host"]
        advertiser = MCNearbyServiceAdvertiser(peer: myPeerId, discoveryInfo: info, serviceType: Self.serviceType)
        advertiser?.delegate = self
        advertiser?.startAdvertisingPeer()
        delegate?.multipeer(event: "hostingStarted", info: ["room": roomCode])
    }

    /// Join nearby — browse and auto-invite any host found for this service.
    func startBrowsing(roomCode: String) {
        stop()
        role = "guest"
        self.roomCode = roomCode
        browser = MCNearbyServiceBrowser(peer: myPeerId, serviceType: Self.serviceType)
        browser?.delegate = self
        browser?.startBrowsingForPeers()
        delegate?.multipeer(event: "browsingStarted", info: ["room": roomCode])
    }

    func stop() {
        advertiser?.stopAdvertisingPeer()
        browser?.stopBrowsingForPeers()
        advertiser = nil
        browser = nil
        session.disconnect()
        role = "idle"
        roomCode = ""
    }

    /// Send a UTF-8 JSON string to all connected peers (reliable).
    @discardableResult
    func send(text: String) -> Bool {
        guard !session.connectedPeers.isEmpty, let data = text.data(using: .utf8) else { return false }
        do {
            try session.send(data, toPeers: session.connectedPeers, with: .reliable)
            return true
        } catch {
            delegate?.multipeer(event: "sendError", info: ["error": error.localizedDescription])
            return false
        }
    }
}

extension MultipeerManager: MCSessionDelegate {
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        switch state {
        case .connected:
            delegate?.multipeer(peerChanged: peerID.displayName, connected: true)
        case .notConnected:
            delegate?.multipeer(peerChanged: peerID.displayName, connected: false)
        case .connecting:
            delegate?.multipeer(event: "peerConnecting", info: ["peer": peerID.displayName])
        @unknown default:
            break
        }
    }

    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        if let text = String(data: data, encoding: .utf8) {
            delegate?.multipeer(didReceive: text, from: peerID.displayName)
        }
    }

    func session(_ s: MCSession, didReceive stream: InputStream, withName n: String, fromPeer p: MCPeerID) {}
    func session(_ s: MCSession, didStartReceivingResourceWithName n: String, fromPeer p: MCPeerID, with progress: Progress) {}
    func session(_ s: MCSession, didFinishReceivingResourceWithName n: String, fromPeer p: MCPeerID, at localURL: URL?, withError e: Error?) {}
}

extension MultipeerManager: MCNearbyServiceAdvertiserDelegate {
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser,
                    didReceiveInvitationFromPeer peerID: MCPeerID,
                    withContext context: Data?,
                    invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        // Host auto-accepts assistants into the session.
        invitationHandler(true, session)
    }
}

extension MultipeerManager: MCNearbyServiceBrowserDelegate {
    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        // Only invite a host advertising our room code (or any host if no code).
        if roomCode.isEmpty || info?["room"] == roomCode {
            browser.invitePeer(peerID, to: session, withContext: nil, timeout: 15)
        }
    }
    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        delegate?.multipeer(event: "peerLost", info: ["peer": peerID.displayName])
    }
}
