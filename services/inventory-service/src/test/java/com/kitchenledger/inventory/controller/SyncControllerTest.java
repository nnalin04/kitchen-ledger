package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.enums.AbcCategory;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncControllerTest {

    @Mock private InventoryItemRepository itemRepository;
    @Mock private HttpServletRequest       request;

    @InjectMocks
    private SyncController syncController;

    private final UUID tenantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        when(request.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID)).thenReturn(tenantId);
    }

    // ── pull without lastPulledAt — full sync ────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void pull_noLastPulledAt_sinceEpoch_allItemsInCreated() {
        InventoryItem item = activeItem();
        when(itemRepository.findByTenantIdAndCreatedAtAfterAndDeletedAtIsNull(
                eq(tenantId), eq(Instant.EPOCH))).thenReturn(List.of(item));
        when(itemRepository.findByTenantIdAndUpdatedAtAfterAndCreatedAtBeforeAndDeletedAtIsNull(
                eq(tenantId), eq(Instant.EPOCH), eq(Instant.EPOCH))).thenReturn(List.of());
        when(itemRepository.findIdsByTenantIdAndDeletedAtAfter(
                eq(tenantId), eq(Instant.EPOCH))).thenReturn(List.of());

        ResponseEntity<Map<String, Object>> response = syncController.pull(request, null);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        Map<String, Object> body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body).containsKey("timestamp");

        Map<String, Object> changes = (Map<String, Object>) body.get("changes");
        Map<String, Object> items   = (Map<String, Object>) changes.get("inventory_items");

        List<?> created = (List<?>) items.get("created");
        assertThat(created).hasSize(1);

        List<?> updated = (List<?>) items.get("updated");
        assertThat(updated).isEmpty();

        List<?> deleted = (List<?>) items.get("deleted");
        assertThat(deleted).isEmpty();
    }

    // ── pull with lastPulledAt — incremental sync ────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void pull_withLastPulledAt_yesterday_updatedItemsInUpdated() {
        Instant yesterday = Instant.now().minus(1, ChronoUnit.DAYS);
        long epochMillis  = yesterday.toEpochMilli();

        InventoryItem updatedItem = activeItem();

        when(itemRepository.findByTenantIdAndCreatedAtAfterAndDeletedAtIsNull(
                eq(tenantId), any(Instant.class))).thenReturn(List.of());
        when(itemRepository.findByTenantIdAndUpdatedAtAfterAndCreatedAtBeforeAndDeletedAtIsNull(
                eq(tenantId), any(Instant.class), any(Instant.class))).thenReturn(List.of(updatedItem));
        when(itemRepository.findIdsByTenantIdAndDeletedAtAfter(
                eq(tenantId), any(Instant.class))).thenReturn(List.of());

        ResponseEntity<Map<String, Object>> response = syncController.pull(request, epochMillis);

        Map<String, Object> changes = (Map<String, Object>) response.getBody().get("changes");
        Map<String, Object> items   = (Map<String, Object>) changes.get("inventory_items");

        assertThat((List<?>) items.get("created")).isEmpty();
        assertThat((List<?>) items.get("updated")).hasSize(1);
        assertThat((List<?>) items.get("deleted")).isEmpty();
    }

    // ── pull with deleted items ──────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void pull_withDeletedItems_uuidsInDeletedArray() {
        UUID deletedId = UUID.randomUUID();
        Instant yesterday = Instant.now().minus(1, ChronoUnit.DAYS);

        when(itemRepository.findByTenantIdAndCreatedAtAfterAndDeletedAtIsNull(
                eq(tenantId), any(Instant.class))).thenReturn(List.of());
        when(itemRepository.findByTenantIdAndUpdatedAtAfterAndCreatedAtBeforeAndDeletedAtIsNull(
                eq(tenantId), any(Instant.class), any(Instant.class))).thenReturn(List.of());
        when(itemRepository.findIdsByTenantIdAndDeletedAtAfter(
                eq(tenantId), any(Instant.class))).thenReturn(List.of(deletedId));

        ResponseEntity<Map<String, Object>> response =
                syncController.pull(request, yesterday.toEpochMilli());

        Map<String, Object> changes = (Map<String, Object>) response.getBody().get("changes");
        Map<String, Object> items   = (Map<String, Object>) changes.get("inventory_items");

        @SuppressWarnings("unchecked")
        List<UUID> deleted = (List<UUID>) items.get("deleted");
        assertThat(deleted).containsExactly(deletedId);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private InventoryItem activeItem() {
        return InventoryItem.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .name("Flour")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("10"))
                .parLevel(new BigDecimal("5"))
                .avgCost(new BigDecimal("2.50"))
                .abcCategory(AbcCategory.B)
                .build();
    }
}
