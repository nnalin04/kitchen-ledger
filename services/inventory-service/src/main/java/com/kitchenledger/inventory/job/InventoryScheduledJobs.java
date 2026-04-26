package com.kitchenledger.inventory.job;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.enums.AbcCategory;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class InventoryScheduledJobs {

    private final InventoryItemRepository itemRepository;
    private final InventoryEventPublisher eventPublisher;
    private final StringRedisTemplate redisTemplate;

    // ── Hourly: low-stock alerts ─────────────────────────────────────────────

    /**
     * Every hour: find all items below PAR across all tenants and publish a low-stock
     * alert event. Alerts are deduplicated with a 4-hour Redis TTL so the same item
     * does not flood the notification channel on consecutive runs.
     */
    @Scheduled(cron = "0 0 * * * *")
    @Transactional(readOnly = true)
    public void checkLowStockAlerts() {
        List<InventoryItem> belowPar = itemRepository.findAllBelowParLevel();
        log.info("InventoryScheduledJobs.checkLowStockAlerts: {} item(s) below PAR", belowPar.size());

        int published = 0;
        int deduplicated = 0;
        int failed = 0;

        for (InventoryItem item : belowPar) {
            try {
                String redisKey = "alert:low_stock:" + item.getTenantId() + ":" + item.getId();
                Boolean isNew = redisTemplate.opsForValue()
                        .setIfAbsent(redisKey, "1", Duration.ofHours(4));
                if (Boolean.TRUE.equals(isNew)) {
                    eventPublisher.publishStockLow(item.getTenantId(), item);
                    published++;
                } else {
                    deduplicated++;
                }
            } catch (Exception e) {
                failed++;
                log.error("InventoryScheduledJobs: low-stock alert failed for item {}: {}",
                        item.getId(), e.getMessage());
            }
        }

        log.info("InventoryScheduledJobs.checkLowStockAlerts: published={}, deduplicated={}, failed={}",
                published, deduplicated, failed);
    }

    // ── Weekly Monday 2am: ABC re-classification ─────────────────────────────

    /**
     * Every Monday at 02:00: recompute ABC classification for every tenant.
     * Top 20% of items by stock value → A, next 30% → B, remaining → C.
     * Items with {@code abcOverride=true} are never reclassified.
     */
    @Scheduled(cron = "0 0 2 * * MON")
    @Transactional
    public void recomputeAbcClassification() {
        List<UUID> tenants = itemRepository.findDistinctTenantsWithActiveItems();
        log.info("InventoryScheduledJobs.recomputeAbcClassification: processing {} tenant(s)", tenants.size());

        int failures = 0;
        for (UUID tenantId : tenants) {
            try {
                classifyForTenant(tenantId);
            } catch (Exception e) {
                failures++;
                log.error("ABC classification failed for tenant {}: {}", tenantId, e.getMessage());
            }
        }

        log.info("InventoryScheduledJobs.recomputeAbcClassification: done, {} failure(s)", failures);
    }

    /**
     * Classifies all active items for a single tenant by stock value
     * (avg_cost × current_stock) descending.  Items that have been manually
     * overridden ({@code abcOverride=true}) are skipped.
     */
    @Transactional
    public void classifyForTenant(UUID tenantId) {
        List<InventoryItem> items =
                itemRepository.findByTenantIdAndDeletedAtIsNullOrderByStockValueDesc(tenantId);
        if (items.isEmpty()) {
            return;
        }

        int total  = items.size();
        int aCount = Math.max(1, (int) Math.ceil(total * 0.20));
        int bCount = Math.max(1, (int) Math.ceil(total * 0.30));

        for (int i = 0; i < items.size(); i++) {
            InventoryItem item = items.get(i);
            if (item.isAbcOverride()) {
                continue; // respect manual override
            }
            AbcCategory newCategory = i < aCount ? AbcCategory.A
                    : i < aCount + bCount ? AbcCategory.B
                    : AbcCategory.C;
            if (newCategory != item.getAbcCategory()) {
                item.setAbcCategory(newCategory);
                itemRepository.save(item);
            }
        }

        log.debug("ABC classification for tenant {}: {} items — A<={}, B<={}, C=rest",
                tenantId, total, aCount, aCount + bCount);
    }
}
