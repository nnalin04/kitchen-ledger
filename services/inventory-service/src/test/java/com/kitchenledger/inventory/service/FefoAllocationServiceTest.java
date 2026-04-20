package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.StockReceiptItem;
import com.kitchenledger.inventory.model.enums.StockItemCondition;
import com.kitchenledger.inventory.repository.StockReceiptItemRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FefoAllocationServiceTest {

    @Mock private StockReceiptItemRepository batchRepository;
    @InjectMocks private FefoAllocationService fefoService;

    private final UUID TENANT  = UUID.randomUUID();
    private final UUID ITEM_ID = UUID.randomUUID();

    // ── FEFO ordering ─────────────────────────────────────────────────────────

    @Test
    void allocate_consumesEarliestExpiryBatchFirst() {
        // Two batches: expiry Mar 5 and Apr 5. Request 3 units.
        StockReceiptItem batchA = batch(new BigDecimal("5"), LocalDate.of(2026, 4, 5)); // later
        StockReceiptItem batchB = batch(new BigDecimal("5"), LocalDate.of(2026, 3, 5)); // earlier → first

        when(batchRepository.findAvailableBatchesByItemFefo(TENANT, ITEM_ID))
                .thenReturn(List.of(batchB, batchA)); // already sorted by the repo

        List<FefoAllocationService.BatchAllocation> result =
                fefoService.allocate(TENANT, ITEM_ID, new BigDecimal("3"));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).batchId()).isEqualTo(batchB.getId());
        assertThat(result.get(0).allocatedQuantity()).isEqualByComparingTo("3");
    }

    @Test
    void allocate_spansMultipleBatchesWhenOneIsInsufficient() {
        StockReceiptItem batchA = batch(new BigDecimal("2"), LocalDate.of(2026, 3, 1)); // 2 units
        StockReceiptItem batchB = batch(new BigDecimal("5"), LocalDate.of(2026, 4, 1)); // 5 units

        when(batchRepository.findAvailableBatchesByItemFefo(TENANT, ITEM_ID))
                .thenReturn(List.of(batchA, batchB));

        List<FefoAllocationService.BatchAllocation> result =
                fefoService.allocate(TENANT, ITEM_ID, new BigDecimal("6"));

        assertThat(result).hasSize(2);
        assertThat(result.get(0).batchId()).isEqualTo(batchA.getId());
        assertThat(result.get(0).allocatedQuantity()).isEqualByComparingTo("2");
        assertThat(result.get(1).batchId()).isEqualTo(batchB.getId());
        assertThat(result.get(1).allocatedQuantity()).isEqualByComparingTo("4");
    }

    @Test
    void allocate_noBatches_returnsEmptyListWithoutThrowing() {
        when(batchRepository.findAvailableBatchesByItemFefo(TENANT, ITEM_ID))
                .thenReturn(List.of());

        List<FefoAllocationService.BatchAllocation> result =
                fefoService.allocate(TENANT, ITEM_ID, new BigDecimal("5"));

        assertThat(result).isEmpty();
    }

    @Test
    void allocate_insufficientBatchStock_returnsPartialAllocations() {
        // Only 3 units available but 10 requested — return what we have
        StockReceiptItem batch = batch(new BigDecimal("3"), LocalDate.of(2026, 3, 1));

        when(batchRepository.findAvailableBatchesByItemFefo(TENANT, ITEM_ID))
                .thenReturn(List.of(batch));

        List<FefoAllocationService.BatchAllocation> result =
                fefoService.allocate(TENANT, ITEM_ID, new BigDecimal("10"));

        assertThat(result).hasSize(1);
        assertThat(result.get(0).allocatedQuantity()).isEqualByComparingTo("3");
    }

    @Test
    void allocate_batchesWithNullExpiryDate_comeAfterDatedBatches() {
        // Items without expiry (non-perishable) should be consumed after those with expiry dates
        StockReceiptItem dated   = batch(new BigDecimal("3"), LocalDate.of(2026, 6, 1));
        StockReceiptItem undated = batch(new BigDecimal("5"), null);

        // Repo returns dated first (earliest-expiry-first ordering, nulls last)
        when(batchRepository.findAvailableBatchesByItemFefo(TENANT, ITEM_ID))
                .thenReturn(List.of(dated, undated));

        List<FefoAllocationService.BatchAllocation> result =
                fefoService.allocate(TENANT, ITEM_ID, new BigDecimal("4"));

        assertThat(result.get(0).batchId()).isEqualTo(dated.getId());
        assertThat(result.get(0).allocatedQuantity()).isEqualByComparingTo("3");
        assertThat(result.get(1).batchId()).isEqualTo(undated.getId());
        assertThat(result.get(1).allocatedQuantity()).isEqualByComparingTo("1");
    }

    // ── applyAllocations ──────────────────────────────────────────────────────

    @Test
    void applyAllocations_decrementsRemainingQuantityOnEachBatch() {
        StockReceiptItem batch = batch(new BigDecimal("10"), LocalDate.of(2026, 5, 1));

        when(batchRepository.findById(batch.getId())).thenReturn(java.util.Optional.of(batch));
        when(batchRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        fefoService.applyAllocations(List.of(
                new FefoAllocationService.BatchAllocation(batch.getId(), new BigDecimal("3"))
        ));

        assertThat(batch.getRemainingQuantity()).isEqualByComparingTo("7");
    }

    @Test
    void applyAllocations_multipleAllocationsUpdateCorrectBatches() {
        StockReceiptItem batchA = batch(new BigDecimal("5"), LocalDate.of(2026, 3, 1));
        StockReceiptItem batchB = batch(new BigDecimal("8"), LocalDate.of(2026, 4, 1));

        when(batchRepository.findById(batchA.getId())).thenReturn(java.util.Optional.of(batchA));
        when(batchRepository.findById(batchB.getId())).thenReturn(java.util.Optional.of(batchB));
        when(batchRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        fefoService.applyAllocations(List.of(
                new FefoAllocationService.BatchAllocation(batchA.getId(), new BigDecimal("5")),
                new FefoAllocationService.BatchAllocation(batchB.getId(), new BigDecimal("2"))
        ));

        assertThat(batchA.getRemainingQuantity()).isEqualByComparingTo("0");
        assertThat(batchB.getRemainingQuantity()).isEqualByComparingTo("6");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private StockReceiptItem batch(BigDecimal qty, LocalDate expiryDate) {
        StockReceiptItem item = StockReceiptItem.builder()
                .id(UUID.randomUUID())
                .stockReceiptId(UUID.randomUUID())
                .inventoryItemId(ITEM_ID)
                .receivedQuantity(qty)
                .remainingQuantity(qty)
                .unit("kg")
                .unitCost(new BigDecimal("50"))
                .expiryDate(expiryDate)
                .condition(StockItemCondition.good)
                .createdAt(Instant.now())
                .build();
        return item;
    }
}
