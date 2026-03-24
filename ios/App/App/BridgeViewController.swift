import Capacitor

class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()

        if bridge?.plugin(withName: "AppleBillingBridge") == nil {
            bridge?.registerPluginInstance(AppleBillingBridge())
        }
    }
}
