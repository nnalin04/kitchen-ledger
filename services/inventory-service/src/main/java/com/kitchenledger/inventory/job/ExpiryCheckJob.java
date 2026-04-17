package com.kitchenledger.inventory.job;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.StockReceiptItem;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.StockReceiptItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class ExpiryCheckJob {

    private final StockReceiptItemRepository receiptItemRepository;
    private final InventoryItemRepository    itemRepository;
    private final InventoryEventPublisher    eventPublisher;

    @Value("${inventory.expiry-alert-days:2}")
    private int defaultAlertDays;

    @Scheduled(cron = "0 0 7 * * *")
    public void runCheck() {
        LocalDate threshold = LocalDate.now().plusDays(defaultAlertDays);
        List<StockReceiptItem> expiring = receiptItemRepository.findAllExpiringSoon(threshold);

        log.info("ExpiryCheckJob: found {} expiring batches (threshold={})", expiring.size(), threshold);

        for (StockReceiptItem batch : expiring) {
            publishAlert(batch);
        }
    }

    private void publishAlert(StockReceiptItem batch) {
        InventoryItem inv = itemRepository.findById(batch.getInventoryItemId()).orElse(null);
        if (inv == null) {
            log.warn("ExpiryCheckJob: inventory item {} not found, skipping batch {}",
                    batch.getInventoryItemId(), batch.getId());
            return;
        }
        int daysRemaining = (int) ChronoUnit.DAYS.between(LocalDate.now(), batch.getExpiryDate());
        eventPublisher.publishStockExpiring(inv.getTenantId(), inv, batch, daysRemaining);
        log.info("ExpiryCheckJob: published expiry alert for item '{}' (expires in {} day(s))",
                inv.getName(), daysRemaining);
    }
}
