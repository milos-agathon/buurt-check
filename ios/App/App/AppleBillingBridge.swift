import Capacitor
import Foundation
import StoreKit
import UIKit

struct AppleBillingBridgeError: Error {
    let message: String
    let code: String
}

@objc(AppleBillingBridge)
public final class AppleBillingBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleBillingBridge"
    public let jsName = "AppleBillingBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentPdfShareSheet", returnType: CAPPluginReturnPromise),
    ]

    private var temporaryShareFileURL: URL?

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": {
                if #available(iOS 15.0, *) {
                    return true
                }
                return false
            }(),
        ])
    }

    @objc func getProduct(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.unavailable("Apple App Store billing requires iOS 15 or newer.")
            return
        }

        Task {
            do {
                let product = try await self.loadProduct(for: try self.productId(from: call))
                call.resolve(self.serializeProduct(product))
            } catch let error as AppleBillingBridgeError {
                call.reject(error.message, error.code)
            } catch {
                call.reject("Unable to load the App Store product.", "PRODUCT_LOAD_FAILED", error)
            }
        }
    }

    @objc func purchaseProduct(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.unavailable("Apple App Store billing requires iOS 15 or newer.")
            return
        }

        Task { @MainActor in
            do {
                let product = try await self.loadProduct(for: try self.productId(from: call))
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    call.resolve(try self.serializeTransaction(
                        verification,
                        expectedProductId: product.id,
                    ))
                case .pending:
                    call.reject(
                        "This App Store purchase is still pending approval.",
                        "PURCHASE_PENDING",
                    )
                case .userCancelled:
                    call.reject("The purchase was cancelled.", "PURCHASE_CANCELLED")
                @unknown default:
                    call.reject("Unexpected App Store purchase result.", "PURCHASE_FAILED")
                }
            } catch let error as AppleBillingBridgeError {
                call.reject(error.message, error.code)
            } catch {
                call.reject("Unable to complete the App Store purchase.", "PURCHASE_FAILED", error)
            }
        }
    }

    @objc func getPendingTransaction(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve([:])
            return
        }

        Task {
            do {
                let productId = try self.productId(from: call)

                for await verification in Transaction.unfinished {
                    do {
                        call.resolve(try self.serializeTransaction(
                            verification,
                            expectedProductId: productId,
                        ))
                        return
                    } catch let error as AppleBillingBridgeError {
                        if error.code == "PRODUCT_MISMATCH" {
                            continue
                        }
                        call.reject(error.message, error.code)
                        return
                    }
                }

                call.resolve([:])
            } catch let error as AppleBillingBridgeError {
                call.reject(error.message, error.code)
            } catch {
                call.reject(
                    "Unable to inspect unfinished App Store transactions.",
                    "PURCHASE_LOOKUP_FAILED",
                    error,
                )
            }
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else {
            call.resolve()
            return
        }

        guard let transactionId = call.getString("transactionId")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !transactionId.isEmpty else {
            call.reject("Missing App Store transaction ID.", "INVALID_TRANSACTION_ID")
            return
        }

        Task {
            for await verification in Transaction.unfinished {
                guard case .verified(let transaction) = verification else {
                    continue
                }

                if String(transaction.id) == transactionId {
                    await transaction.finish()
                    call.resolve()
                    return
                }
            }

            call.resolve()
        }
    }

    @objc func presentPdfShareSheet(_ call: CAPPluginCall) {
        guard let base64Data = call.getString("base64Data")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !base64Data.isEmpty else {
            call.reject("Missing PDF data.", "INVALID_SHARE_PAYLOAD")
            return
        }

        let filename = sanitizedFilename(call.getString("filename"))
        guard let data = Data(base64Encoded: base64Data, options: [.ignoreUnknownCharacters]) else {
            call.reject("Invalid PDF payload.", "INVALID_SHARE_PAYLOAD")
            return
        }

        Task { @MainActor in
            do {
                let presenter = try self.presentationViewController()
                let fileURL = try self.writeTemporaryShareFile(
                    data: data,
                    filename: filename,
                )
                let title = call.getString("title")?.trimmingCharacters(in: .whitespacesAndNewlines)

                var activityItems: [Any] = [fileURL]
                if let title, !title.isEmpty {
                    activityItems.insert(title, at: 0)
                }

                let controller = UIActivityViewController(
                    activityItems: activityItems,
                    applicationActivities: nil,
                )
                controller.completionWithItemsHandler = { [weak self] _, _, _, _ in
                    self?.deleteTemporaryShareFile()
                }

                if let popover = controller.popoverPresentationController {
                    popover.sourceView = presenter.view
                    popover.sourceRect = presenter.view.bounds
                }

                presenter.present(controller, animated: true) {
                    call.resolve()
                }
            } catch let error as AppleBillingBridgeError {
                call.reject(error.message, error.code)
            } catch {
                call.reject("Unable to present the PDF share sheet.", "SHARE_FAILED", error)
            }
        }
    }

    @available(iOS 15.0, *)
    private func loadProduct(for productId: String) async throws -> Product {
        let products = try await Product.products(for: [productId])
        guard let product = products.first(where: { $0.id == productId }) else {
            throw AppleBillingBridgeError(
                message: "The App Store product is unavailable.",
                code: "PRODUCT_NOT_FOUND",
            )
        }
        return product
    }

    private func productId(from call: CAPPluginCall) throws -> String {
        guard let productId = call.getString("productId")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !productId.isEmpty else {
            throw AppleBillingBridgeError(
                message: "Missing App Store product ID.",
                code: "INVALID_PRODUCT_ID",
            )
        }
        return productId
    }

    @available(iOS 15.0, *)
    private func serializeProduct(_ product: Product) -> JSObject {
        [
            "productId": product.id,
            "title": product.displayName,
            "description": product.description,
            "displayPrice": product.displayPrice,
        ]
    }

    @available(iOS 15.0, *)
    private func serializeTransaction(
        _ verification: VerificationResult<Transaction>,
        expectedProductId: String,
    ) throws -> JSObject {
        switch verification {
        case .verified(let transaction):
            guard transaction.productID == expectedProductId else {
                throw AppleBillingBridgeError(
                    message: "Unfinished transaction belongs to a different product.",
                    code: "PRODUCT_MISMATCH",
                )
            }

            return [
                "productId": transaction.productID,
                "transactionId": String(transaction.id),
                "originalTransactionId": String(transaction.originalID),
                "signedTransactionInfo": verification.jwsRepresentation,
            ]
        case .unverified(let transaction, _):
            if transaction.productID != expectedProductId {
                throw AppleBillingBridgeError(
                    message: "Unfinished transaction belongs to a different product.",
                    code: "PRODUCT_MISMATCH",
                )
            }

            throw AppleBillingBridgeError(
                message: "StoreKit could not verify the App Store transaction.",
                code: "PURCHASE_UNVERIFIED",
            )
        }
    }

    @MainActor
    private func presentationViewController() throws -> UIViewController {
        if let presented = bridge?.viewController?.presentedViewController {
            return presented
        }
        if let viewController = bridge?.viewController {
            return viewController
        }

        throw AppleBillingBridgeError(
            message: "No iOS view controller is available for App Store UI.",
            code: "UI_UNAVAILABLE",
        )
    }

    private func writeTemporaryShareFile(data: Data, filename: String) throws -> URL {
        deleteTemporaryShareFile()

        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
            "buurt-check-share",
            isDirectory: true,
        )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
        )

        let fileURL = directory.appendingPathComponent(filename, isDirectory: false)
        try data.write(to: fileURL, options: [.atomic])
        temporaryShareFileURL = fileURL
        return fileURL
    }

    private func deleteTemporaryShareFile() {
        guard let fileURL = temporaryShareFileURL else {
            return
        }

        try? FileManager.default.removeItem(at: fileURL)
        temporaryShareFileURL = nil
    }
}

private func sanitizedFilename(_ rawFilename: String?) -> String {
    let trimmed = rawFilename?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if trimmed.isEmpty {
        return "buurt-check-dossier.pdf"
    }

    return trimmed
        .replacingOccurrences(of: "/", with: "-")
        .replacingOccurrences(of: "\\", with: "-")
}
