package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.response.APAgingEntry;
import com.kitchenledger.finance.dto.response.APAgingResponse;
import com.kitchenledger.finance.model.Vendor;
import com.kitchenledger.finance.model.VendorPayment;
import com.kitchenledger.finance.repository.VendorPaymentRepository;
import com.kitchenledger.finance.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Accounts-payable aging report service.
 *
 * <p>Aging buckets are based on days since the payment due date (or payment date when no due date):
 * <ul>
 *   <li>current   : 0–30 days past due</li>
 *   <li>31–60     : 31–60 days past due</li>
 *   <li>61–90     : 61–90 days past due</li>
 *   <li>90+       : over 90 days past due</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AccountsPayableService {

    private final VendorPaymentRepository vendorPaymentRepository;
    private final VendorRepository vendorRepository;

    /**
     * Build an AP aging summary for the given tenant.
     * Includes all vendor payments with paymentStatus = "pending" or "overdue".
     */
    @Transactional(readOnly = true)
    public APAgingResponse getSummary(UUID tenantId) {
        List<VendorPayment> unpaid = vendorPaymentRepository.findUnpaidByTenant(tenantId);
        LocalDate today = LocalDate.now();

        BigDecimal totalOutstanding = BigDecimal.ZERO;
        BigDecimal totalOverdue     = BigDecimal.ZERO;
        BigDecimal dueSoon          = BigDecimal.ZERO; // due within 7 days

        // vendor bucket builders — keyed by vendorId
        Map<UUID, APAgingEntry.APAgingEntryBuilder> byVendor = new LinkedHashMap<>();

        for (VendorPayment vp : unpaid) {
            BigDecimal amount = vp.getAmount();
            totalOutstanding = totalOutstanding.add(amount);

            if ("overdue".equals(vp.getPaymentStatus())) {
                totalOverdue = totalOverdue.add(amount);
            }

            // Due within 7 days (pending payments approaching deadline)
            if (vp.getDueDate() != null && !vp.getDueDate().isAfter(today.plusDays(7))) {
                dueSoon = dueSoon.add(amount);
            }

            UUID vendorId = vp.getVendorId();
            APAgingEntry.APAgingEntryBuilder builder = byVendor.computeIfAbsent(vendorId,
                    id -> APAgingEntry.builder()
                            .vendorId(id)
                            .vendorName(resolveVendorName(tenantId, id))
                            .current(BigDecimal.ZERO)
                            .days31to60(BigDecimal.ZERO)
                            .days61to90(BigDecimal.ZERO)
                            .days90plus(BigDecimal.ZERO)
                            .total(BigDecimal.ZERO)
                            .oldestInvoiceDate(null));

            // Reference date: due date when present, else payment/invoice date
            LocalDate refDate = vp.getDueDate() != null ? vp.getDueDate() : vp.getPaymentDate();
            long daysOld = ChronoUnit.DAYS.between(refDate, today);

            // Add to the correct aging bucket
            APAgingEntry partial = builder.build();
            if (daysOld <= 30) {
                builder.current(partial.getCurrent().add(amount));
            } else if (daysOld <= 60) {
                builder.days31to60(partial.getDays31to60().add(amount));
            } else if (daysOld <= 90) {
                builder.days61to90(partial.getDays61to90().add(amount));
            } else {
                builder.days90plus(partial.getDays90plus().add(amount));
            }
            builder.total(partial.getTotal().add(amount));

            // Track oldest invoice date
            LocalDate invoiceDate = vp.getPaymentDate();
            if (partial.getOldestInvoiceDate() == null
                    || invoiceDate.isBefore(partial.getOldestInvoiceDate())) {
                builder.oldestInvoiceDate(invoiceDate);
            }
        }

        List<APAgingEntry> vendors = new ArrayList<>();
        for (APAgingEntry.APAgingEntryBuilder b : byVendor.values()) {
            vendors.add(b.build());
        }

        return APAgingResponse.builder()
                .totalOutstanding(totalOutstanding)
                .totalOverdue(totalOverdue)
                .dueSoon(dueSoon)
                .vendors(vendors)
                .build();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String resolveVendorName(UUID tenantId, UUID vendorId) {
        return vendorRepository.findByIdAndTenantIdAndDeletedAtIsNull(vendorId, tenantId)
                .map(Vendor::getName)
                .orElse("Unknown vendor");
    }
}
