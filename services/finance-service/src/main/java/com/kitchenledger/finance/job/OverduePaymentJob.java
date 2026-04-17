package com.kitchenledger.finance.job;

import com.kitchenledger.finance.event.FinanceEventPublisher;
import com.kitchenledger.finance.model.VendorPayment;
import com.kitchenledger.finance.repository.VendorPaymentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class OverduePaymentJob {

    private final VendorPaymentRepository vendorPaymentRepository;
    private final FinanceEventPublisher   eventPublisher;

    @Scheduled(cron = "0 0 8 * * *")
    public void runCheck() {
        LocalDate today = LocalDate.now();
        // Discover which tenants have overdue payments, then process each tenant separately
        // so payments are always scoped to their tenant — no cross-tenant data mixing.
        List<UUID> tenants = vendorPaymentRepository.findDistinctTenantsWithOverdue(today);
        log.info("OverduePaymentJob: {} tenant(s) have overdue payments", tenants.size());
        for (UUID tenantId : tenants) {
            processForTenant(tenantId, today);
        }
    }

    @Transactional
    public void processForTenant(UUID tenantId, LocalDate today) {
        List<VendorPayment> overdue = vendorPaymentRepository.findOverdue(tenantId, today);
        for (VendorPayment vp : overdue) {
            vp.setPaymentStatus("overdue");
            vendorPaymentRepository.save(vp);
            eventPublisher.publishPaymentOverdue(vp);
            log.info("OverduePaymentJob: marked payment {} overdue (tenant={}, vendor={}, amount={})",
                    vp.getId(), tenantId, vp.getVendorId(), vp.getAmount());
        }
    }
}
