package com.kitchenledger.inventory.job;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.StockReceiptItem;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.StockReceiptItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ExpiryCheckJobTest {

    @Mock private StockReceiptItemRepository receiptItemRepository;
    @Mock private InventoryItemRepository    itemRepository;
    @Mock private InventoryEventPublisher    eventPublisher;

    @InjectMocks
    private ExpiryCheckJob expiryCheckJob;

    private final UUID tenantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        // @Value fields are not injected by Mockito — set manually
        ReflectionTestUtils.setField(expiryCheckJob, "defaultAlertDays", 2);
    }

    private InventoryItem item(UUID id) {
        return InventoryItem.builder()
                .id(id).tenantId(tenantId)
                .name("Tomatoes").purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .expiryAlertDays(2)
                .build();
    }

    private StockReceiptItem expiringBatch(UUID itemId, int daysFromNow) {
        return StockReceiptItem.builder()
                .id(UUID.randomUUID())
                .inventoryItemId(itemId)
                .stockReceiptId(UUID.randomUUID())
                .receivedQuantity(new BigDecimal("5"))
                .unit("kg")
                .unitCost(new BigDecimal("10"))
                .expiryDate(LocalDate.now().plusDays(daysFromNow))
                .build();
    }

    // ── runCheck ──────────────────────────────────────────────────────────────

    @Test
    void runCheck_expiringBatch_publishesStockExpiringEvent() {
        UUID itemId = UUID.randomUUID();
        StockReceiptItem batch = expiringBatch(itemId, 1);
        InventoryItem inv = item(itemId);

        when(receiptItemRepository.findAllExpiringSoon(any())).thenReturn(List.of(batch));
        when(itemRepository.findById(itemId)).thenReturn(Optional.of(inv));

        expiryCheckJob.runCheck();

        verify(eventPublisher).publishStockExpiring(eq(tenantId), eq(inv), eq(batch), eq(1));
    }

    @Test
    void runCheck_noExpiringBatches_noPublish() {
        when(receiptItemRepository.findAllExpiringSoon(any())).thenReturn(List.of());

        expiryCheckJob.runCheck();

        verify(eventPublisher, never()).publishStockExpiring(any(), any(), any(), anyInt());
    }

    @Test
    void runCheck_itemNotFound_skipsWithoutPublish() {
        UUID itemId = UUID.randomUUID();
        StockReceiptItem batch = expiringBatch(itemId, 1);

        when(receiptItemRepository.findAllExpiringSoon(any())).thenReturn(List.of(batch));
        when(itemRepository.findById(itemId)).thenReturn(Optional.empty());

        expiryCheckJob.runCheck();

        verify(eventPublisher, never()).publishStockExpiring(any(), any(), any(), anyInt());
    }

    @Test
    void runCheck_usesDefaultAlertDaysAsThreshold() {
        when(receiptItemRepository.findAllExpiringSoon(any())).thenReturn(List.of());

        expiryCheckJob.runCheck();

        // Default alert days = 2; threshold = today + 2
        ArgumentCaptor<LocalDate> captor = ArgumentCaptor.forClass(LocalDate.class);
        verify(receiptItemRepository).findAllExpiringSoon(captor.capture());
        assertThat(captor.getValue()).isEqualTo(LocalDate.now().plusDays(2));
    }

    @Test
    void runCheck_multipleBatches_publishesForEach() {
        UUID itemId1 = UUID.randomUUID();
        UUID itemId2 = UUID.randomUUID();
        StockReceiptItem b1 = expiringBatch(itemId1, 1);
        StockReceiptItem b2 = expiringBatch(itemId2, 2);

        when(receiptItemRepository.findAllExpiringSoon(any())).thenReturn(List.of(b1, b2));
        when(itemRepository.findById(itemId1)).thenReturn(Optional.of(item(itemId1)));
        when(itemRepository.findById(itemId2)).thenReturn(Optional.of(item(itemId2)));

        expiryCheckJob.runCheck();

        verify(eventPublisher, times(2)).publishStockExpiring(any(), any(), any(), anyInt());
    }
}
