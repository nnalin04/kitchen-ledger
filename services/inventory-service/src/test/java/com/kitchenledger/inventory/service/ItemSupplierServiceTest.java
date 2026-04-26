package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.InventoryItemSupplier;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryItemSupplierRepository;
import com.kitchenledger.inventory.repository.SupplierRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ItemSupplierServiceTest {

    @Mock private InventoryItemSupplierRepository itemSupplierRepository;
    @Mock private InventoryItemRepository itemRepository;
    @Mock private SupplierRepository supplierRepository;
    @Mock private InventoryEventPublisher eventPublisher;

    @InjectMocks
    private ItemSupplierService itemSupplierService;

    private final UUID tenantId   = UUID.randomUUID();
    private final UUID itemId     = UUID.randomUUID();
    private final UUID supplierId = UUID.randomUUID();

    private InventoryItem buildItem() {
        return InventoryItem.builder()
                .id(itemId)
                .tenantId(tenantId)
                .name("Tomatoes")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .priceAlertThreshold(new BigDecimal("10.00"))
                .avgCost(new BigDecimal("5.00"))
                .build();
    }

    // ── linkSupplier — not preferred ──────────────────────────────────────────

    @Test
    void linkSupplier_notPreferred_savedWithIsPreferredFalse() {
        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(buildItem()));
        when(supplierRepository.existsByIdAndTenantIdAndDeletedAtIsNull(supplierId, tenantId))
                .thenReturn(true);
        when(itemSupplierRepository.existsByTenantIdAndInventoryItemIdAndSupplierId(tenantId, itemId, supplierId))
                .thenReturn(false);

        InventoryItemSupplier saved = InventoryItemSupplier.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).inventoryItemId(itemId)
                .supplierId(supplierId).unitPrice(new BigDecimal("2.0000")).preferred(false)
                .build();
        when(itemSupplierRepository.save(any())).thenReturn(saved);

        InventoryItemSupplier result = itemSupplierService.linkSupplier(
                tenantId, itemId, supplierId, new BigDecimal("2.0"), false);

        assertThat(result.isPreferred()).isFalse();
        verify(itemSupplierRepository, never()).clearPreferredExcept(any(), any(), any());
    }

    // ── linkSupplier — preferred clears other links ───────────────────────────

    @Test
    void linkSupplier_preferred_clearsOtherPreferredFlags() {
        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(buildItem()));
        when(supplierRepository.existsByIdAndTenantIdAndDeletedAtIsNull(supplierId, tenantId))
                .thenReturn(true);
        when(itemSupplierRepository.existsByTenantIdAndInventoryItemIdAndSupplierId(tenantId, itemId, supplierId))
                .thenReturn(false);

        UUID savedId = UUID.randomUUID();
        InventoryItemSupplier saved = InventoryItemSupplier.builder()
                .id(savedId).tenantId(tenantId).inventoryItemId(itemId)
                .supplierId(supplierId).unitPrice(new BigDecimal("3.0000")).preferred(true)
                .build();
        when(itemSupplierRepository.save(any())).thenReturn(saved);

        itemSupplierService.linkSupplier(tenantId, itemId, supplierId, new BigDecimal("3.0"), true);

        verify(itemSupplierRepository).clearPreferredExcept(tenantId, itemId, savedId);
    }

    // ── unlinkSupplier — only supplier → throws ValidationException ───────────

    @Test
    void unlinkSupplier_onlyPreferredSupplier_throwsValidationException() {
        InventoryItemSupplier link = InventoryItemSupplier.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).inventoryItemId(itemId)
                .supplierId(supplierId).unitPrice(BigDecimal.ONE).preferred(true)
                .build();

        when(itemSupplierRepository.findByTenantIdAndInventoryItemIdAndSupplierId(tenantId, itemId, supplierId))
                .thenReturn(Optional.of(link));
        when(itemSupplierRepository.countByTenantIdAndInventoryItemId(tenantId, itemId))
                .thenReturn(1L);

        assertThatThrownBy(() -> itemSupplierService.unlinkSupplier(tenantId, itemId, supplierId))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("only preferred supplier");

        verify(itemSupplierRepository, never()).delete(any(InventoryItemSupplier.class));
    }

    // ── updateSupplierPrice — delta > threshold → publishes price alert ────────

    @Test
    void updateSupplierPrice_aboveThreshold_publishesPriceAlertEvent() {
        InventoryItem item = buildItem(); // priceAlertThreshold = 10.00, avgCost = 5.00
        InventoryItemSupplier link = InventoryItemSupplier.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).inventoryItemId(itemId)
                .supplierId(supplierId).unitPrice(new BigDecimal("5.0000")).preferred(false)
                .build();

        when(itemSupplierRepository.findByTenantIdAndInventoryItemIdAndSupplierId(tenantId, itemId, supplierId))
                .thenReturn(Optional.of(link));
        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(item));
        when(itemSupplierRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(itemRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Old price 5.00, new price 6.00 → delta = 20% which is > threshold of 10%
        itemSupplierService.updateSupplierPrice(tenantId, itemId, supplierId, new BigDecimal("6.00"));

        ArgumentCaptor<BigDecimal> deltaCaptor = ArgumentCaptor.forClass(BigDecimal.class);
        verify(eventPublisher).publishPriceAlert(eq(tenantId), eq(item), deltaCaptor.capture());
        assertThat(deltaCaptor.getValue()).isGreaterThan(new BigDecimal("10.00"));
    }

    // ── updateSupplierPrice — delta <= threshold → no event ───────────────────

    @Test
    void updateSupplierPrice_belowThreshold_doesNotPublishPriceAlert() {
        InventoryItem item = buildItem(); // priceAlertThreshold = 10.00
        InventoryItemSupplier link = InventoryItemSupplier.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).inventoryItemId(itemId)
                .supplierId(supplierId).unitPrice(new BigDecimal("5.0000")).preferred(false)
                .build();

        when(itemSupplierRepository.findByTenantIdAndInventoryItemIdAndSupplierId(tenantId, itemId, supplierId))
                .thenReturn(Optional.of(link));
        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId))
                .thenReturn(Optional.of(item));
        when(itemSupplierRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Old price 5.00, new price 5.40 → delta = 8% which is < threshold of 10%
        itemSupplierService.updateSupplierPrice(tenantId, itemId, supplierId, new BigDecimal("5.40"));

        verify(eventPublisher, never()).publishPriceAlert(any(), any(), any());
    }
}
