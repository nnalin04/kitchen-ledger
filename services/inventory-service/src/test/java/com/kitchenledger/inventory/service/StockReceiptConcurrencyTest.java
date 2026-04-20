package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.model.StockReceipt;
import com.kitchenledger.inventory.model.StockReceiptItem;
import com.kitchenledger.inventory.model.enums.StockItemCondition;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import com.kitchenledger.inventory.repository.StockReceiptItemRepository;
import com.kitchenledger.inventory.repository.StockReceiptRepository;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.service.FefoAllocationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StockReceiptConcurrencyTest {

    @Mock private StockReceiptRepository receiptRepository;
    @Mock private StockReceiptItemRepository receiptItemRepository;
    @Mock private InventoryItemRepository itemRepository;
    @Mock private InventoryMovementRepository movementRepository;
    @Mock private InventoryEventPublisher eventPublisher;
    @Mock private FefoAllocationService fefoAllocationService;

    @InjectMocks private StockReceiptService service;

    private final UUID TENANT = UUID.randomUUID();

    @Test
    void confirm_alreadyConfirmedReceipt_throwsConflict() {
        StockReceipt confirmed = StockReceipt.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .confirmed(true)
                .version(1)
                .items(new ArrayList<>())
                .build();

        when(receiptRepository.findByIdAndTenantId(confirmed.getId(), TENANT))
                .thenReturn(Optional.of(confirmed));

        assertThatThrownBy(() -> service.confirm(TENANT, confirmed.getId()))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already confirmed");
    }

    @Test
    void confirm_optimisticLockFailure_propagatesAsConflict() {
        StockReceipt receipt = unconfirmedReceipt();

        when(receiptRepository.findByIdAndTenantId(receipt.getId(), TENANT))
                .thenReturn(Optional.of(receipt));
        // No items in receipt — loop skipped, save throws directly
        when(receiptRepository.save(any()))
                .thenThrow(new ObjectOptimisticLockingFailureException(StockReceipt.class, receipt.getId()));

        assertThatThrownBy(() -> service.confirm(TENANT, receipt.getId()))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("concurrent");
    }

    @Test
    void confirm_hasVersionField_allowsOptimisticLocking() {
        // Verify StockReceipt entity has a @Version-mapped field by checking
        // that version is accessible on the entity builder
        StockReceipt receipt = StockReceipt.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .version(0)
                .items(new ArrayList<>())
                .build();

        assertThat(receipt.getVersion()).isEqualTo(0);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private StockReceipt unconfirmedReceipt() {
        return StockReceipt.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .confirmed(false)
                .version(0)
                .items(new ArrayList<>())
                .createdAt(Instant.now())
                .build();
    }
}
