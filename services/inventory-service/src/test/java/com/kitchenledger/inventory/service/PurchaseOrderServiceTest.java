package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.PurchaseOrder;
import com.kitchenledger.inventory.model.enums.PurchaseOrderStatus;
import com.kitchenledger.inventory.repository.PurchaseOrderRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PurchaseOrderServiceTest {

    @Mock private PurchaseOrderRepository poRepository;
    @Mock private InventoryEventPublisher eventPublisher;

    @InjectMocks
    private PurchaseOrderService purchaseOrderService;

    private final UUID tenantId = UUID.randomUUID();
    private final UUID poId     = UUID.randomUUID();

    private PurchaseOrder draftPo() {
        return PurchaseOrder.builder()
                .id(poId)
                .tenantId(tenantId)
                .supplierId(UUID.randomUUID())
                .poNumber("PO-001")
                .totalAmount(new BigDecimal("5000.00"))
                .status(PurchaseOrderStatus.draft)
                .createdBy(UUID.randomUUID())
                .build();
    }

    // ── send() — publishes po.sent event ─────────────────────────────────────

    @Test
    void send_draftPo_transitionsToSentAndPublishesEvent() {
        PurchaseOrder po = draftPo();
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(poId, tenantId))
                .thenReturn(Optional.of(po));
        when(poRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PurchaseOrder result = purchaseOrderService.send(tenantId, poId, "email");

        assertThat(result.getStatus()).isEqualTo(PurchaseOrderStatus.sent);
        assertThat(result.getSentVia()).isEqualTo("email");
        assertThat(result.getSentAt()).isNotNull();
        verify(eventPublisher).publishPoSent(tenantId, result);
    }

    @Test
    void send_nonDraftPo_throwsValidationException() {
        PurchaseOrder sent = draftPo();
        sent.setStatus(PurchaseOrderStatus.sent);
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(poId, tenantId))
                .thenReturn(Optional.of(sent));

        assertThatThrownBy(() -> purchaseOrderService.send(tenantId, poId, "whatsapp"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("draft");

        verify(eventPublisher, never()).publishPoSent(any(), any());
    }

    @Test
    void send_publishesEventWithCorrectPoData() {
        PurchaseOrder po = draftPo();
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(poId, tenantId))
                .thenReturn(Optional.of(po));
        when(poRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        purchaseOrderService.send(tenantId, poId, "manual");

        // Verify the exact PO passed to publisher has status=sent
        verify(eventPublisher).publishPoSent(eq(tenantId), argThat(saved ->
                saved.getStatus() == PurchaseOrderStatus.sent
                && "PO-001".equals(saved.getPoNumber())
        ));
    }
}
