package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.ReceiveLineItemRequest;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.PurchaseOrder;
import com.kitchenledger.inventory.model.PurchaseOrderItem;
import com.kitchenledger.inventory.model.enums.PurchaseOrderStatus;
import com.kitchenledger.inventory.repository.PurchaseOrderRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PurchaseOrderServiceLifecycleTest {

    @Mock private PurchaseOrderRepository poRepository;
    @Mock private InventoryEventPublisher eventPublisher;
    @InjectMocks private PurchaseOrderService service;

    private final UUID TENANT = UUID.randomUUID();

    // ── receivePartial ────────────────────────────────────────────────────────

    @Test
    void receivePartial_someLines_transitionsToPartial() {
        PurchaseOrder po = sentPo(10, 0);
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(po.getId(), TENANT))
                .thenReturn(Optional.of(po));
        when(poRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Receive only 5 of 10
        List<ReceiveLineItemRequest> lines = List.of(
                new ReceiveLineItemRequest(po.getItems().get(0).getId(), new BigDecimal("5"))
        );
        PurchaseOrder result = service.receivePartial(TENANT, po.getId(), UUID.randomUUID(), lines);

        assertThat(result.getStatus()).isEqualTo(PurchaseOrderStatus.partial);
        assertThat(result.getItems().get(0).getReceivedQuantity()).isEqualByComparingTo("5");
    }

    @Test
    void receivePartial_allLines_transitionsToReceived() {
        PurchaseOrder po = sentPo(10, 0);
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(po.getId(), TENANT))
                .thenReturn(Optional.of(po));
        when(poRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Receive all 10
        List<ReceiveLineItemRequest> lines = List.of(
                new ReceiveLineItemRequest(po.getItems().get(0).getId(), new BigDecimal("10"))
        );
        PurchaseOrder result = service.receivePartial(TENANT, po.getId(), UUID.randomUUID(), lines);

        assertThat(result.getStatus()).isEqualTo(PurchaseOrderStatus.received);
    }

    @Test
    void receivePartial_overReceipt_throwsValidationException() {
        PurchaseOrder po = sentPo(10, 0);
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(po.getId(), TENANT))
                .thenReturn(Optional.of(po));

        // Try to receive 11 (more than ordered)
        List<ReceiveLineItemRequest> lines = List.of(
                new ReceiveLineItemRequest(po.getItems().get(0).getId(), new BigDecimal("11"))
        );
        assertThatThrownBy(() -> service.receivePartial(TENANT, po.getId(), UUID.randomUUID(), lines))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("over-receipt");
    }

    @Test
    void receivePartial_draftPo_throwsValidationException() {
        PurchaseOrder po = draftPo(10);
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(po.getId(), TENANT))
                .thenReturn(Optional.of(po));

        List<ReceiveLineItemRequest> lines = List.of(
                new ReceiveLineItemRequest(po.getItems().get(0).getId(), new BigDecimal("5"))
        );
        assertThatThrownBy(() -> service.receivePartial(TENANT, po.getId(), UUID.randomUUID(), lines))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Cannot receive");
    }

    @Test
    void receivePartial_emitsStatusChangeEvent() {
        PurchaseOrder po = sentPo(10, 0);
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(po.getId(), TENANT))
                .thenReturn(Optional.of(po));
        when(poRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        List<ReceiveLineItemRequest> lines = List.of(
                new ReceiveLineItemRequest(po.getItems().get(0).getId(), new BigDecimal("10"))
        );
        service.receivePartial(TENANT, po.getId(), UUID.randomUUID(), lines);

        verify(eventPublisher).publishPoStatusChanged(eq(TENANT), any(), eq(PurchaseOrderStatus.sent), eq(PurchaseOrderStatus.received));
    }

    // ── close ─────────────────────────────────────────────────────────────────

    @Test
    void close_receivedPo_transitionsToClosed() {
        PurchaseOrder po = receivedPo(10, 10);
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(po.getId(), TENANT))
                .thenReturn(Optional.of(po));
        when(poRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PurchaseOrder result = service.close(TENANT, po.getId());

        assertThat(result.getStatus()).isEqualTo(PurchaseOrderStatus.closed);
    }

    @Test
    void close_draftPo_throwsValidationException() {
        PurchaseOrder po = draftPo(10);
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(po.getId(), TENANT))
                .thenReturn(Optional.of(po));

        assertThatThrownBy(() -> service.close(TENANT, po.getId()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Cannot close");
    }

    @Test
    void close_partialPo_requiresManagerOverride_withoutOverride_throws() {
        PurchaseOrder po = partialPo(10, 5);
        when(poRepository.findByIdAndTenantIdAndDeletedAtIsNull(po.getId(), TENANT))
                .thenReturn(Optional.of(po));

        assertThatThrownBy(() -> service.close(TENANT, po.getId()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("partially received");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private PurchaseOrder draftPo(double ordered) {
        return makePo(PurchaseOrderStatus.draft, ordered, 0);
    }

    private PurchaseOrder sentPo(double ordered, double received) {
        return makePo(PurchaseOrderStatus.sent, ordered, received);
    }

    private PurchaseOrder partialPo(double ordered, double received) {
        return makePo(PurchaseOrderStatus.partial, ordered, received);
    }

    private PurchaseOrder receivedPo(double ordered, double received) {
        return makePo(PurchaseOrderStatus.received, ordered, received);
    }

    private PurchaseOrder makePo(PurchaseOrderStatus status, double ordered, double received) {
        UUID poId   = UUID.randomUUID();
        UUID itemId = UUID.randomUUID();

        PurchaseOrderItem item = PurchaseOrderItem.builder()
                .id(itemId)
                .purchaseOrderId(poId)
                .inventoryItemId(UUID.randomUUID())
                .orderedQuantity(BigDecimal.valueOf(ordered))
                .orderedUnit("kg")
                .unitPrice(new BigDecimal("50"))
                .receivedQuantity(BigDecimal.valueOf(received))
                .build();

        return PurchaseOrder.builder()
                .id(poId)
                .tenantId(TENANT)
                .poNumber("PO-TEST-001")
                .supplierId(UUID.randomUUID())
                .status(status)
                .items(new ArrayList<>(List.of(item)))
                .build();
    }
}
