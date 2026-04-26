package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.request.GenerateQrRequest;
import com.kitchenledger.finance.dto.response.UpiTransactionResponse;
import com.kitchenledger.finance.security.GatewayTrustFilter;
import com.kitchenledger.finance.security.RequiresRole;
import com.kitchenledger.finance.service.UpiService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class UpiController {

    private final UpiService upiService;

    /**
     * Generates a UPI QR code / intent URL for a payment of the specified amount.
     * Returns the transaction in PENDING status with a unique reference and the UPI intent URL.
     */
    @PostMapping("/api/v1/finance/upi/generate-qr")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<UpiTransactionResponse> generateQr(
            @Valid @RequestBody GenerateQrRequest req,
            HttpServletRequest request) {
        UUID tenantId = (UUID) request.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
        return ResponseEntity.ok(upiService.generateQr(tenantId, req));
    }

    /**
     * Webhook endpoint for UPI payment providers.
     * No gateway auth — HMAC-SHA256 signature is verified inside the service.
     */
    @PostMapping("/api/webhooks/upi-payment")
    public ResponseEntity<Void> webhook(
            @RequestBody String rawBody,
            @RequestHeader(value = "X-Webhook-Signature", required = false) String sig,
            HttpServletRequest request) {
        upiService.handleWebhook(rawBody, sig);
        return ResponseEntity.ok().build();
    }
}
