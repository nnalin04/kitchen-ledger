package com.kitchenledger.inventory.job;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.enums.AbcCategory;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class InventoryScheduledJobsTest {

    @Mock private InventoryItemRepository  itemRepository;
    @Mock private InventoryEventPublisher  eventPublisher;
    @Mock private StringRedisTemplate      redisTemplate;
    @Mock private ValueOperations<String, String> valueOps;

    @InjectMocks
    private InventoryScheduledJobs scheduledJobs;

    private final UUID tenantId  = UUID.randomUUID();
    private final UUID tenantId2 = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
    }

    // ── checkLowStockAlerts ──────────────────────────────────────────────────

    @Test
    void checkLowStockAlerts_itemBelowPar_redisKeyAbsent_publishesEvent() {
        InventoryItem item = belowParItem(tenantId);
        when(itemRepository.findAllBelowParLevel()).thenReturn(List.of(item));
        when(valueOps.setIfAbsent(anyString(), eq("1"), any())).thenReturn(Boolean.TRUE);

        scheduledJobs.checkLowStockAlerts();

        verify(eventPublisher).publishStockLow(tenantId, item);
    }

    @Test
    void checkLowStockAlerts_itemBelowPar_redisKeyExists_doesNotPublish() {
        InventoryItem item = belowParItem(tenantId);
        when(itemRepository.findAllBelowParLevel()).thenReturn(List.of(item));
        when(valueOps.setIfAbsent(anyString(), eq("1"), any())).thenReturn(Boolean.FALSE);

        scheduledJobs.checkLowStockAlerts();

        verify(eventPublisher, never()).publishStockLow(any(), any());
    }

    @Test
    void checkLowStockAlerts_noItemsBelowPar_noEvents() {
        when(itemRepository.findAllBelowParLevel()).thenReturn(List.of());

        scheduledJobs.checkLowStockAlerts();

        verify(eventPublisher, never()).publishStockLow(any(), any());
        verifyNoInteractions(eventPublisher);
    }

    @Test
    void checkLowStockAlerts_oneItemThrows_jobContinuesForOthers() {
        InventoryItem item1 = belowParItem(tenantId);
        InventoryItem item2 = belowParItem(tenantId);
        InventoryItem item3 = belowParItem(tenantId);

        when(itemRepository.findAllBelowParLevel()).thenReturn(List.of(item1, item2, item3));
        // item1: succeeds, item2: Redis throws, item3: succeeds
        when(valueOps.setIfAbsent(anyString(), eq("1"), any()))
                .thenReturn(Boolean.TRUE)
                .thenThrow(new RuntimeException("Redis connection error"))
                .thenReturn(Boolean.TRUE);

        // Must not propagate the exception
        assertThatCode(() -> scheduledJobs.checkLowStockAlerts()).doesNotThrowAnyException();

        // item1 and item3 still published
        verify(eventPublisher, times(2)).publishStockLow(eq(tenantId), any());
    }

    // ── classifyForTenant ────────────────────────────────────────────────────

    @Test
    void classifyForTenant_fiveItems_correctAbcBoundaries() {
        // 5 items sorted descending by stock value: top 1 (20%) → A, next 2 (30%) → B, last 2 → C
        UUID t = UUID.randomUUID();
        InventoryItem i1 = item(t, AbcCategory.C, false, new BigDecimal("500"));
        InventoryItem i2 = item(t, AbcCategory.C, false, new BigDecimal("400"));
        InventoryItem i3 = item(t, AbcCategory.C, false, new BigDecimal("300"));
        InventoryItem i4 = item(t, AbcCategory.C, false, new BigDecimal("200"));
        InventoryItem i5 = item(t, AbcCategory.C, false, new BigDecimal("100"));

        when(itemRepository.findByTenantIdAndDeletedAtIsNullOrderByStockValueDesc(t))
                .thenReturn(List.of(i1, i2, i3, i4, i5));

        scheduledJobs.classifyForTenant(t);

        // i1 → A (saved because changed from C)
        verify(itemRepository).save(argThat(i -> i.getAbcCategory() == AbcCategory.A));
        // i2, i3 → B (saved because changed from C)
        verify(itemRepository, times(2)).save(argThat(i -> i.getAbcCategory() == AbcCategory.B));
        // i4, i5 remain C — no save needed
        verify(itemRepository, times(3)).save(any()); // total: 1 A + 2 B = 3 saves
    }

    @Test
    void classifyForTenant_abcOverrideTrue_itemNotReclassified() {
        UUID t = UUID.randomUUID();
        // overridden item is currently C but flagged — must stay C
        InventoryItem overridden = item(t, AbcCategory.C, true, new BigDecimal("999"));
        InventoryItem normal     = item(t, AbcCategory.C, false, new BigDecimal("100"));

        when(itemRepository.findByTenantIdAndDeletedAtIsNullOrderByStockValueDesc(t))
                .thenReturn(List.of(overridden, normal));

        scheduledJobs.classifyForTenant(t);

        // overridden item must never be saved
        verify(itemRepository, never()).save(argThat(i -> i.getId().equals(overridden.getId())));
    }

    @Test
    void classifyForTenant_noItems_noOp() {
        UUID t = UUID.randomUUID();
        when(itemRepository.findByTenantIdAndDeletedAtIsNullOrderByStockValueDesc(t))
                .thenReturn(List.of());

        scheduledJobs.classifyForTenant(t);

        verify(itemRepository, never()).save(any());
    }

    // ── recomputeAbcClassification ───────────────────────────────────────────

    @Test
    void recomputeAbcClassification_twoTenants_classifyCalledForEach() {
        when(itemRepository.findDistinctTenantsWithActiveItems())
                .thenReturn(List.of(tenantId, tenantId2));
        when(itemRepository.findByTenantIdAndDeletedAtIsNullOrderByStockValueDesc(any()))
                .thenReturn(List.of());

        scheduledJobs.recomputeAbcClassification();

        verify(itemRepository).findByTenantIdAndDeletedAtIsNullOrderByStockValueDesc(tenantId);
        verify(itemRepository).findByTenantIdAndDeletedAtIsNullOrderByStockValueDesc(tenantId2);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private InventoryItem belowParItem(UUID tid) {
        return InventoryItem.builder()
                .id(UUID.randomUUID())
                .tenantId(tid)
                .name("Test Item")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("2"))
                .parLevel(new BigDecimal("5"))
                .avgCost(BigDecimal.ZERO)
                .abcCategory(AbcCategory.C)
                .build();
    }

    private InventoryItem item(UUID tid, AbcCategory category, boolean override, BigDecimal stockValue) {
        return InventoryItem.builder()
                .id(UUID.randomUUID())
                .tenantId(tid)
                .name("Item-" + category)
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(stockValue)
                .avgCost(BigDecimal.ONE)
                .abcCategory(category)
                .abcOverride(override)
                .parLevel(BigDecimal.TEN)
                .build();
    }
}
