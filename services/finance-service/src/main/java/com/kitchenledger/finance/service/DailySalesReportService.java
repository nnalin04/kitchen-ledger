package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.request.CreateDsrRequest;
import com.kitchenledger.finance.event.FinanceEventPublisher;
import com.kitchenledger.finance.exception.ConflictException;
import com.kitchenledger.finance.exception.ResourceNotFoundException;
import com.kitchenledger.finance.exception.ValidationException;
import com.kitchenledger.finance.model.DailySalesReport;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DailySalesReportService {

    /** Fire a cash discrepancy event when variance exceeds this amount (INR). */
    private static final BigDecimal CASH_DISCREPANCY_THRESHOLD = new BigDecimal("10.00");

    private final DailySalesReportRepository dsrRepository;
    private final FinanceEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public Page<DailySalesReport> list(UUID tenantId, LocalDate from, LocalDate to, Pageable pageable) {
        if (from != null && to != null) {
            return dsrRepository.findByTenantIdAndReportDateBetweenOrderByReportDateDesc(
                    tenantId, from, to, pageable);
        }
        return dsrRepository.findByTenantIdOrderByReportDateDesc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public DailySalesReport getByDate(UUID tenantId, LocalDate date) {
        return dsrRepository.findByTenantIdAndReportDate(tenantId, date)
                .orElseThrow(() -> new ResourceNotFoundException("No DSR found for date: " + date));
    }

    @Transactional(readOnly = true)
    public DailySalesReport getById(UUID tenantId, UUID id) {
        return dsrRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("DSR not found: " + id));
    }

    @Transactional(readOnly = true)
    public BigDecimal totalGrossSales(UUID tenantId, LocalDate from, LocalDate to) {
        return dsrRepository.sumGrossSalesBetween(tenantId, from, to);
    }

    @Transactional(readOnly = true)
    public BigDecimal totalNetSales(UUID tenantId, LocalDate from, LocalDate to) {
        return dsrRepository.sumNetSalesBetween(tenantId, from, to);
    }

    @Transactional
    public DailySalesReport create(UUID tenantId, UUID createdBy, CreateDsrRequest req) {
        if (dsrRepository.findByTenantIdAndReportDate(tenantId, req.getReportDate()).isPresent()) {
            throw new ConflictException("DSR already exists for date: " + req.getReportDate());
        }
        DailySalesReport dsr = DailySalesReport.builder()
                .tenantId(tenantId)
                .reportDate(req.getReportDate())
                .coversCount(req.getCoversCount())
                .grossSales(req.getGrossSales())
                .discounts(req.getDiscounts())
                .cashSales(req.getCashSales())
                .upiSales(req.getUpiSales())
                .cardSales(req.getCardSales())
                .otherSales(req.getOtherSales())
                .vatCollected(req.getVatCollected())
                .serviceChargeCollected(req.getServiceChargeCollected())
                .costOfGoodsSold(req.getCostOfGoodsSold())
                .notes(req.getNotes())
                .createdBy(createdBy)
                .build();
        return dsrRepository.save(dsr);
    }

    @Transactional
    public DailySalesReport update(UUID tenantId, UUID id, CreateDsrRequest req) {
        DailySalesReport dsr = getById(tenantId, id);
        if (dsr.isFinalized()) {
            throw new ValidationException("Cannot update a finalized DSR.");
        }
        dsr.setCoversCount(req.getCoversCount());
        dsr.setGrossSales(req.getGrossSales());
        dsr.setDiscounts(req.getDiscounts());
        dsr.setCashSales(req.getCashSales());
        dsr.setUpiSales(req.getUpiSales());
        dsr.setCardSales(req.getCardSales());
        dsr.setOtherSales(req.getOtherSales());
        dsr.setVatCollected(req.getVatCollected());
        dsr.setServiceChargeCollected(req.getServiceChargeCollected());
        dsr.setCostOfGoodsSold(req.getCostOfGoodsSold());
        dsr.setNotes(req.getNotes());
        return dsrRepository.save(dsr);
    }

    @Transactional
    public DailySalesReport finalize(UUID tenantId, UUID id, UUID approvedBy) {
        DailySalesReport dsr = getById(tenantId, id);
        if (dsr.isFinalized()) {
            throw new ConflictException("DSR is already finalized.");
        }
        dsr.setFinalized(true);
        dsr.setApprovedBy(approvedBy);
        dsr.setFinalizedAt(Instant.now());
        DailySalesReport saved = dsrRepository.save(dsr);
        eventPublisher.publishDsrReconciled(tenantId, saved);
        return saved;
    }

    /**
     * Record the physical cash count for the day and check for discrepancies.
     * Expected cash = cashSales (POS-recorded).
     * Fires {@code finance.cash.discrepancy} when |variance| > {@code CASH_DISCREPANCY_THRESHOLD}.
     */
    @Transactional
    public DailySalesReport reconcile(UUID tenantId, UUID id, BigDecimal actualCash) {
        DailySalesReport dsr = getById(tenantId, id);

        BigDecimal expectedCash = dsr.getCashSales();
        BigDecimal variance     = actualCash.subtract(expectedCash);

        dsr.setCashCountActual(actualCash);
        dsr.setCashOverShort(variance);

        if (variance.abs().compareTo(CASH_DISCREPANCY_THRESHOLD) > 0) {
            dsr.setRequiresInvestigation(true);
            DailySalesReport saved = dsrRepository.save(dsr);
            eventPublisher.publishCashDiscrepancy(saved, expectedCash, actualCash, variance);
            return saved;
        }

        return dsrRepository.save(dsr);
    }
}
