package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreateInventoryItemRequest;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InventoryItemServiceTest {

    @Mock private InventoryItemRepository itemRepository;
    @Mock private InventoryMovementRepository movementRepository;
    @Mock private InventoryEventPublisher eventPublisher;

    @InjectMocks
    private InventoryItemService inventoryItemService;

    private final UUID tenantId = UUID.randomUUID();

    // ── list ──────────────────────────────────────────────────────────────────

    @Test
    void testList_returnsPagedResults() {
        InventoryItem item = InventoryItem.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).name("Tomatoes")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .build();
        PageRequest pageable = PageRequest.of(0, 20);
        Page<InventoryItem> page = new PageImpl<>(List.of(item), pageable, 1);

        when(itemRepository.findWithFilters(tenantId, null, null, false, pageable))
                .thenReturn(page);

        Page<InventoryItem> result = inventoryItemService.list(tenantId, null, null, false, pageable);

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent().get(0).getName()).isEqualTo("Tomatoes");
    }

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void testCreate_duplicateName_throwsConflictException() {
        when(itemRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, "Tomatoes"))
                .thenReturn(true);

        CreateInventoryItemRequest req = new CreateInventoryItemRequest();
        req.setName("Tomatoes");
        req.setPurchaseUnit("kg");
        req.setRecipeUnit("g");
        req.setCountUnit("kg");

        assertThatThrownBy(() -> inventoryItemService.create(tenantId, req))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Tomatoes");

        verify(itemRepository, never()).save(any());
    }

    // ── adjustStock ───────────────────────────────────────────────────────────

    @Test
    void testAdjustStock_dropsBelowPar_publishesStockLowEvent() {
        UUID itemId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        InventoryItem item = InventoryItem.builder()
                .id(itemId).tenantId(tenantId).name("Flour")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("5.0"))
                .parLevel(new BigDecimal("10.0"))
                .avgCost(BigDecimal.ONE)
                .build();

        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(item));
        when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(movementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Adjust down by 2 → stock = 3.0, still below PAR of 10
        InventoryItem result = inventoryItemService.adjustStock(
                tenantId, itemId, new BigDecimal("-2"), "kg", "manual count", userId);

        assertThat(result.getCurrentStock()).isEqualByComparingTo(new BigDecimal("3.0"));
        verify(eventPublisher).publishStockLow(tenantId, item);
    }

    @Test
    void testAdjustStock_abovePar_doesNotPublishStockLowEvent() {
        UUID itemId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        InventoryItem item = InventoryItem.builder()
                .id(itemId).tenantId(tenantId).name("Salt")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("20.0"))
                .parLevel(new BigDecimal("5.0"))
                .avgCost(BigDecimal.ONE)
                .build();

        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(item));
        when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(movementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        inventoryItemService.adjustStock(tenantId, itemId, new BigDecimal("5"), "kg", "restock", userId);

        verify(eventPublisher, never()).publishStockLow(any(), any());
    }

    // ── getById ───────────────────────────────────────────────────────────────

    @Test
    void testGetById_wrongTenant_throwsResourceNotFoundException() {
        UUID itemId   = UUID.randomUUID();
        UUID otherTenantId = UUID.randomUUID();

        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, otherTenantId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> inventoryItemService.getById(otherTenantId, itemId))
                .isInstanceOf(ResourceNotFoundException.class);
    }
}
