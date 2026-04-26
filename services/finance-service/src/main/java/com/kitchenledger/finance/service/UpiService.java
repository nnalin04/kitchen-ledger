package com.kitchenledger.finance.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.finance.dto.request.GenerateQrRequest;
import com.kitchenledger.finance.dto.response.UpiTransactionResponse;
import com.kitchenledger.finance.exception.ValidationException;
import com.kitchenledger.finance.model.UpiTransaction;
import com.kitchenledger.finance.repository.UpiTransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class UpiService {

    private final UpiTransactionRepository upiRepo;
    private final ObjectMapper objectMapper;

    @Value("${upi.webhook.secret:}")
    private String webhookSecret;

    @Value("${upi.default.merchant.id:merchant@kitchenledger}")
    private String defaultMerchantUpiId;

    @Transactional
    public UpiTransactionResponse generateQr(UUID tenantId, GenerateQrRequest req) {
        String ref = "KL-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();

        // Build UPI intent URL — tenant UPI ID from tenant settings (placeholder until tenant settings API is wired)
        String upiIntentUrl = String.format(
                "upi://pay?pa=%s&pn=KitchenLedger&am=%s&tr=%s&tn=%s",
                req.getMerchantUpiId() != null ? req.getMerchantUpiId() : defaultMerchantUpiId,
                req.getAmount().toPlainString(),
                ref,
                req.getDescription() != null ? req.getDescription() : "Payment"
        );

        UpiTransaction tx = UpiTransaction.builder()
                .tenantId(tenantId)
                .reportDate(req.getReportDate() != null ? req.getReportDate() : LocalDate.now())
                .transactionRef(ref)
                .amount(req.getAmount())
                .status("PENDING")
                .build();
        tx = upiRepo.save(tx);

        log.info("UPI QR generated: ref={} amount={} tenant={}", ref, req.getAmount(), tenantId);

        UpiTransactionResponse resp = UpiTransactionResponse.from(tx);
        resp.setUpiIntentUrl(upiIntentUrl);
        // QR image generation would go here (use ZXing if available, else return intent URL for client-side QR)
        return resp;
    }

    @Transactional
    public void handleWebhook(String rawBody, String hmacHeader) {
        // Verify HMAC-SHA256 if secret configured
        if (webhookSecret != null && !webhookSecret.isBlank()) {
            String expected = computeHmac(webhookSecret, rawBody);
            if (!expected.equalsIgnoreCase(hmacHeader)) {
                throw new ValidationException("Invalid webhook signature");
            }
        }

        try {
            Map<String, Object> payload = objectMapper.readValue(rawBody, new TypeReference<>() {});
            String ref = (String) payload.get("transaction_ref");
            String status = (String) payload.get("status");

            if (ref == null) {
                log.warn("UPI webhook missing transaction_ref");
                return;
            }

            upiRepo.findByTransactionRef(ref).ifPresent(tx -> {
                if ("SUCCESS".equalsIgnoreCase(tx.getStatus())) {
                    log.info("UPI webhook: idempotent replay for ref={}", ref);
                    return; // already processed
                }
                tx.setStatus("SUCCESS".equalsIgnoreCase(status) ? "SUCCESS" : "FAILED");
                tx.setSettledAt(Instant.now());
                tx.setPayerVpa((String) payload.get("payer_vpa"));
                tx.setRawWebhook(rawBody);
                upiRepo.save(tx);
                log.info("UPI transaction updated: ref={} status={}", ref, tx.getStatus());
            });
        } catch (ValidationException e) {
            throw e;
        } catch (Exception e) {
            log.error("UPI webhook processing error: {}", e.getMessage());
            throw new ValidationException("Invalid webhook payload");
        }
    }

    private String computeHmac(String secret, String data) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(secret.getBytes(), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(data.getBytes()));
        } catch (Exception e) {
            throw new RuntimeException("HMAC computation failed", e);
        }
    }
}
