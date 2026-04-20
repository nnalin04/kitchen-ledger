package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.LogWasteRequest;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.WasteLog;
import com.kitchenledger.inventory.model.enums.WasteReason;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import com.kitchenledger.inventory.repository.WasteLogRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WasteLogServiceTest {

    @Mock private WasteLogRepository wasteLogRepository;
    @Mock private InventoryItemRepository itemRepository;
    @Mock private InventoryMovementRepository movementRepository;
    @Mock private InventoryEventPublisher eventPublisher;

    @InjectMocks
    private WasteLogService wasteLogService;

    private final UUID tenantId = UUID.randomUUID();
    private final UUID userId   = UUID.randomUUID();

    // ── logWaste ──────────────────────────────────────────────────────────────

    @Test
    void testLogWaste_validEntry_decrementsStockAndSavesLog() {
        UUID itemId = UUID.randomUUID();
        InventoryItem item = InventoryItem.builder()
                .id(itemId).tenantId(tenantId).name("Lettuce")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("10.0"))
                .parLevel(new BigDecimal("2.0"))
                .avgCost(new BigDecimal("50.00"))
                .build();

        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(item));
        when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(movementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(wasteLogRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        LogWasteRequest req = new LogWasteRequest();
        req.setInventoryItemId(itemId);
        req.setQuantity(new BigDecimal("2.0"));
        req.setUnit("kg");
        req.setReason(WasteReason.spoilage);

        WasteLog log = wasteLogService.logWaste(tenantId, userId, req);

        assertThat(item.getCurrentStock()).isEqualByComparingTo(new BigDecimal("8.0"));
        assertThat(log.getQuantity()).isEqualByComparingTo(new BigDecimal("2.0"));
        assertThat(log.getReason()).isEqualTo(WasteReason.spoilage);
    }

    @Test
    void testLogWaste_itemNotFound_throwsResourceNotFoundException() {
        UUID unknownItemId = UUID.randomUUID();
        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(unknownItemId, tenantId))
                .thenReturn(Optional.empty());

        LogWasteRequest req = new LogWasteRequest();
        req.setInventoryItemId(unknownItemId);
        req.setQuantity(new BigDecimal("1.0"));
        req.setUnit("kg");
        req.setReason(WasteReason.spoilage);

        assertThatThrownBy(() -> wasteLogService.logWaste(tenantId, userId, req))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(wasteLogRepository, never()).save(any());
    }

    @Test
    void testLogWaste_estimatedCostCalculatedFromAvgCostWhenNotProvided() {
        UUID itemId = UUID.randomUUID();
        InventoryItem item = InventoryItem.builder()
                .id(itemId).tenantId(tenantId).name("Chicken")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("5.0"))
                .parLevel(new BigDecimal("1.0"))
                .avgCost(new BigDecimal("200.00"))  // ₹200/kg
                .build();

        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(item));
        when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(movementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ArgumentCaptor<WasteLog> captor = ArgumentCaptor.forClass(WasteLog.class);
        when(wasteLogRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        LogWasteRequest req = new LogWasteRequest();
        req.setInventoryItemId(itemId);
        req.setQuantity(new BigDecimal("0.5"));  // 500g wasted
        req.setUnit("kg");
        req.setReason(WasteReason.cooking_error);
        // estimatedCost not provided → should compute 0.5 * 200 = 100

        wasteLogService.logWaste(tenantId, userId, req);

        WasteLog saved = captor.getValue();
        assertThat(saved.getEstimatedCost()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void testLogWaste_explicitEstimatedCostOverridesAvgCost() {
        UUID itemId = UUID.randomUUID();
        InventoryItem item = InventoryItem.builder()
                .id(itemId).tenantId(tenantId).name("Lamb")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("3.0"))
                .parLevel(new BigDecimal("1.0"))
                .avgCost(new BigDecimal("500.00"))
                .build();

        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(item));
        when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(movementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ArgumentCaptor<WasteLog> captor = ArgumentCaptor.forClass(WasteLog.class);
        when(wasteLogRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        LogWasteRequest req = new LogWasteRequest();
        req.setInventoryItemId(itemId);
        req.setQuantity(new BigDecimal("1.0"));
        req.setUnit("kg");
        req.setReason(WasteReason.expiration);
        req.setEstimatedCost(new BigDecimal("350.00"));  // explicit override

        wasteLogService.logWaste(tenantId, userId, req);

        WasteLog saved = captor.getValue();
        assertThat(saved.getEstimatedCost()).isEqualByComparingTo(new BigDecimal("350.00"));
    }
}
