package com.kitchenledger.finance.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.finance.dto.request.GenerateQrRequest;
import com.kitchenledger.finance.dto.response.UpiTransactionResponse;
import com.kitchenledger.finance.exception.ValidationException;
import com.kitchenledger.finance.model.UpiTransaction;
import com.kitchenledger.finance.repository.UpiTransactionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UpiServiceTest {

    @Mock private UpiTransactionRepository upiRepo;
    @InjectMocks private UpiService upiService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // Wire the ObjectMapper into the service (Mockito @InjectMocks doesn't inject non-mock fields)
    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(upiService, "objectMapper", objectMapper);
        ReflectionTestUtils.setField(upiService, "webhookSecret", "");
    }

    // ── generateQr ────────────────────────────────────────────────────────────

    @Test
    void generateQr_createsTransactionWithPendingStatusAndKlRef() {
        UUID tenantId = UUID.randomUUID();
        GenerateQrRequest req = new GenerateQrRequest();
        req.setAmount(new BigDecimal("250.00"));
        req.setDescription("Lunch payment");

        when(upiRepo.save(any(UpiTransaction.class))).thenAnswer(inv -> {
            UpiTransaction tx = inv.getArgument(0);
            ReflectionTestUtils.setField(tx, "id", UUID.randomUUID());
            return tx;
        });

        UpiTransactionResponse resp = upiService.generateQr(tenantId, req);

        ArgumentCaptor<UpiTransaction> captor = ArgumentCaptor.forClass(UpiTransaction.class);
        verify(upiRepo).save(captor.capture());

        UpiTransaction saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo("PENDING");
        assertThat(saved.getTransactionRef()).startsWith("KL-");
        assertThat(saved.getAmount()).isEqualByComparingTo(new BigDecimal("250.00"));
        assertThat(saved.getTenantId()).isEqualTo(tenantId);

        assertThat(resp.getUpiIntentUrl()).contains("upi://pay");
        assertThat(resp.getUpiIntentUrl()).contains("250.00");
    }

    @Test
    void generateQr_usesTodayAsReportDateWhenNotProvided() {
        UUID tenantId = UUID.randomUUID();
        GenerateQrRequest req = new GenerateQrRequest();
        req.setAmount(new BigDecimal("100.00"));

        when(upiRepo.save(any())).thenAnswer(inv -> {
            UpiTransaction tx = inv.getArgument(0);
            ReflectionTestUtils.setField(tx, "id", UUID.randomUUID());
            return tx;
        });

        upiService.generateQr(tenantId, req);

        ArgumentCaptor<UpiTransaction> captor = ArgumentCaptor.forClass(UpiTransaction.class);
        verify(upiRepo).save(captor.capture());
        assertThat(captor.getValue().getReportDate()).isEqualTo(java.time.LocalDate.now());
    }

    // ── handleWebhook ─────────────────────────────────────────────────────────

    @Test
    void handleWebhook_validPayload_updatesTransactionToSuccess() throws Exception {
        String ref = "KL-ABCDEF123456";
        UpiTransaction pending = UpiTransaction.builder()
                .id(UUID.randomUUID())
                .tenantId(UUID.randomUUID())
                .transactionRef(ref)
                .amount(new BigDecimal("500.00"))
                .status("PENDING")
                .build();

        when(upiRepo.findByTransactionRef(ref)).thenReturn(Optional.of(pending));
        when(upiRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "transaction_ref", ref,
                "status", "SUCCESS",
                "payer_vpa", "user@oksbi"
        ));

        upiService.handleWebhook(body, null);

        ArgumentCaptor<UpiTransaction> captor = ArgumentCaptor.forClass(UpiTransaction.class);
        verify(upiRepo).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo("SUCCESS");
        assertThat(captor.getValue().getPayerVpa()).isEqualTo("user@oksbi");
        assertThat(captor.getValue().getSettledAt()).isNotNull();
    }

    @Test
    void handleWebhook_alreadySuccess_noChangeIdempotent() throws Exception {
        String ref = "KL-IDEMPOTENT00";
        UpiTransaction alreadyDone = UpiTransaction.builder()
                .id(UUID.randomUUID())
                .tenantId(UUID.randomUUID())
                .transactionRef(ref)
                .amount(new BigDecimal("300.00"))
                .status("SUCCESS")
                .build();

        when(upiRepo.findByTransactionRef(ref)).thenReturn(Optional.of(alreadyDone));

        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "transaction_ref", ref,
                "status", "SUCCESS"
        ));

        upiService.handleWebhook(body, null);

        // save should NOT be called — transaction is already in SUCCESS state
        verify(upiRepo, never()).save(any());
    }

    @Test
    void handleWebhook_missingTransactionRef_logsWarningNoException() throws Exception {
        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "status", "SUCCESS"
                // no transaction_ref
        ));

        // Must not throw
        upiService.handleWebhook(body, null);

        verify(upiRepo, never()).findByTransactionRef(any());
        verify(upiRepo, never()).save(any());
    }

    @Test
    void handleWebhook_invalidHmac_throwsValidationException() {
        ReflectionTestUtils.setField(upiService, "webhookSecret", "supersecret");
        String body = "{\"transaction_ref\":\"KL-TEST\",\"status\":\"SUCCESS\"}";

        assertThatThrownBy(() -> upiService.handleWebhook(body, "invalidsignature"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("signature");
    }
}
