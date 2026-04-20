package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.StockReceipt;
import com.kitchenledger.inventory.model.StockReceiptItem;
import com.kitchenledger.inventory.model.enums.StockItemCondition;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import com.kitchenledger.inventory.repository.StockReceiptItemRepository;
import com.kitchenledger.inventory.repository.StockReceiptRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StockReceiptServiceTest {

    @Mock private StockReceiptRepository receiptRepository;
    @Mock private InventoryItemRepository itemRepository;
    @Mock private InventoryMovementRepository movementRepository;
    @Mock private InventoryEventPublisher eventPublisher;
    @Mock private StockReceiptItemRepository receiptItemRepository;

    @InjectMocks
    private StockReceiptService stockReceiptService;

    private final UUID tenantId  = UUID.randomUUID();
    private final UUID receiptId = UUID.randomUUID();

    // ── prefillFromOcr ────────────────────────────────────────────────────────

    @Test
    void prefillFromOcr_matchedItem_savesReceiptItem() {
        UUID itemId = UUID.randomUUID();
        StockReceipt receipt = StockReceipt.builder()
                .id(receiptId).tenantId(tenantId).receivedBy(UUID.randomUUID()).build();

        InventoryItem item = InventoryItem.builder()
                .id(itemId).tenantId(tenantId)
                .name("Tomatoes").purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .build();

        when(receiptRepository.findByIdAndTenantId(receiptId, tenantId))
                .thenReturn(Optional.of(receipt));
        when(itemRepository.findWithFilters(eq(tenantId), eq("Tomatoes"), isNull(), eq(false), any()))
                .thenReturn(new PageImpl<>(List.of(item)));
        when(receiptItemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        stockReceiptService.prefillFromOcr(tenantId, receiptId, List.of(
                Map.of("name", "Tomatoes", "quantity", "5", "unit_price", "20")
        ));

        ArgumentCaptor<StockReceiptItem> captor = ArgumentCaptor.forClass(StockReceiptItem.class);
        verify(receiptItemRepository).save(captor.capture());

        StockReceiptItem saved = captor.getValue();
        assertThat(saved.getStockReceiptId()).isEqualTo(receiptId);
        assertThat(saved.getInventoryItemId()).isEqualTo(itemId);
        assertThat(saved.getExpectedQuantity()).isEqualByComparingTo(new BigDecimal("5"));
        assertThat(saved.getReceivedQuantity()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(saved.getUnitCost()).isEqualByComparingTo(new BigDecimal("20"));
        assertThat(saved.getUnit()).isEqualTo("kg");
        assertThat(saved.getCondition()).isEqualTo(StockItemCondition.good);
    }

    @Test
    void prefillFromOcr_unmatchedItem_skipsNoSave() {
        StockReceipt receipt = StockReceipt.builder()
                .id(receiptId).tenantId(tenantId).receivedBy(UUID.randomUUID()).build();

        when(receiptRepository.findByIdAndTenantId(receiptId, tenantId))
                .thenReturn(Optional.of(receipt));
        when(itemRepository.findWithFilters(eq(tenantId), any(), isNull(), eq(false), any()))
                .thenReturn(new PageImpl<>(List.of()));

        stockReceiptService.prefillFromOcr(tenantId, receiptId, List.of(
                Map.of("name", "UnknownIngredient", "quantity", "1", "unit_price", "10")
        ));

        verify(receiptItemRepository, never()).save(any());
    }

    @Test
    void prefillFromOcr_alreadyConfirmed_skipsWithoutSaving() {
        StockReceipt confirmed = StockReceipt.builder()
                .id(receiptId).tenantId(tenantId).receivedBy(UUID.randomUUID())
                .confirmed(true)
                .build();

        when(receiptRepository.findByIdAndTenantId(receiptId, tenantId))
                .thenReturn(Optional.of(confirmed));

        stockReceiptService.prefillFromOcr(tenantId, receiptId, List.of(
                Map.of("name", "Flour", "quantity", "10", "unit_price", "5")
        ));

        verify(receiptItemRepository, never()).save(any());
        verify(itemRepository, never()).findWithFilters(any(), any(), any(), anyBoolean(), any());
    }

    @Test
    void prefillFromOcr_emptyLineItems_noSave() {
        StockReceipt receipt = StockReceipt.builder()
                .id(receiptId).tenantId(tenantId).receivedBy(UUID.randomUUID()).build();

        when(receiptRepository.findByIdAndTenantId(receiptId, tenantId))
                .thenReturn(Optional.of(receipt));

        stockReceiptService.prefillFromOcr(tenantId, receiptId, List.of());

        verify(receiptItemRepository, never()).save(any());
    }

    @Test
    void prefillFromOcr_itemMissingName_skipsWithoutSave() {
        StockReceipt receipt = StockReceipt.builder()
                .id(receiptId).tenantId(tenantId).receivedBy(UUID.randomUUID()).build();

        when(receiptRepository.findByIdAndTenantId(receiptId, tenantId))
                .thenReturn(Optional.of(receipt));

        // line item with no "name" key
        stockReceiptService.prefillFromOcr(tenantId, receiptId, List.of(
                Map.of("quantity", "3", "unit_price", "15")
        ));

        verify(receiptItemRepository, never()).save(any());
        verify(itemRepository, never()).findWithFilters(any(), any(), any(), anyBoolean(), any());
    }

    // ── confirmReceipt ────────────────────────────────────────────────────────

    @Test
    void confirmReceipt_updatesStockAndWeightedAvgCost() {
        UUID itemId = UUID.randomUUID();
        InventoryItem item = InventoryItem.builder()
                .id(itemId).tenantId(tenantId)
                .name("Onions").purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("10.0"))
                .avgCost(new BigDecimal("20.00"))
                .parLevel(new BigDecimal("2.0"))
                .build();

        StockReceiptItem lineItem = StockReceiptItem.builder()
                .inventoryItemId(itemId)
                .expectedQuantity(new BigDecimal("5.0"))
                .receivedQuantity(new BigDecimal("5.0"))
                .unitCost(new BigDecimal("22.00"))
                .unit("kg")
                .condition(StockItemCondition.good)
                .build();

        StockReceipt receipt = StockReceipt.builder()
                .id(receiptId).tenantId(tenantId).receivedBy(UUID.randomUUID())
                .confirmed(false)
                .items(new ArrayList<>(List.of(lineItem)))
                .build();

        when(receiptRepository.findByIdAndTenantId(receiptId, tenantId))
                .thenReturn(Optional.of(receipt));
        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(item));
        when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(movementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(receiptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        StockReceipt confirmed = stockReceiptService.confirm(tenantId, receiptId);

        // new stock = 10 + 5 = 15
        assertThat(item.getCurrentStock()).isEqualByComparingTo(new BigDecimal("15.0"));
        // weighted avg = (10*20 + 5*22) / 15 = (200 + 110) / 15 = 20.6667
        assertThat(item.getAvgCost()).isGreaterThan(new BigDecimal("20.00"));
        assertThat(confirmed.isConfirmed()).isTrue();
    }

    @Test
    void confirmReceipt_alreadyConfirmed_throwsConflictException() {
        StockReceipt already = StockReceipt.builder()
                .id(receiptId).tenantId(tenantId).receivedBy(UUID.randomUUID())
                .confirmed(true)
                .items(new ArrayList<>())
                .build();

        when(receiptRepository.findByIdAndTenantId(receiptId, tenantId))
                .thenReturn(Optional.of(already));

        assertThatThrownBy(() -> stockReceiptService.confirm(tenantId, receiptId))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already confirmed");
    }

    @Test
    void confirmReceipt_afterConfirm_stockBelowParFiresStockLowEvent() {
        UUID itemId = UUID.randomUUID();
        // Stock is high before receipt, but par is very high too
        InventoryItem item = InventoryItem.builder()
                .id(itemId).tenantId(tenantId)
                .name("Butter").purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("1.0"))
                .avgCost(new BigDecimal("100.00"))
                .parLevel(new BigDecimal("5.0"))  // par=5, stock after receipt = 1+1 = 2, still below par
                .build();

        StockReceiptItem lineItem = StockReceiptItem.builder()
                .inventoryItemId(itemId)
                .receivedQuantity(new BigDecimal("1.0"))
                .unitCost(new BigDecimal("100.00"))
                .unit("kg")
                .condition(StockItemCondition.good)
                .build();

        StockReceipt receipt = StockReceipt.builder()
                .id(receiptId).tenantId(tenantId).receivedBy(UUID.randomUUID())
                .confirmed(false)
                .items(new ArrayList<>(List.of(lineItem)))
                .build();

        when(receiptRepository.findByIdAndTenantId(receiptId, tenantId))
                .thenReturn(Optional.of(receipt));
        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(item));
        when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(movementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(receiptRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        stockReceiptService.confirm(tenantId, receiptId);

        // stock = 2, par = 5 → still below par → event fired
        verify(eventPublisher).publishStockLow(tenantId, item);
    }
}
