package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.request.CreateDsrRequest;
import com.kitchenledger.finance.event.FinanceEventPublisher;
import com.kitchenledger.finance.exception.ConflictException;
import com.kitchenledger.finance.model.DailySalesReport;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DailySalesReportServiceTest {

    @Mock private DailySalesReportRepository dsrRepository;
    @Mock private FinanceEventPublisher eventPublisher;

    @InjectMocks
    private DailySalesReportService dsrService;

    private final UUID tenantId = UUID.randomUUID();
    private final UUID userId   = UUID.randomUUID();

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void testCreate_validEntry_savesAndReturnsDsr() {
        LocalDate today = LocalDate.now();
        when(dsrRepository.findByTenantIdAndReportDate(tenantId, today))
                .thenReturn(Optional.empty());
        when(dsrRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        CreateDsrRequest req = new CreateDsrRequest();
        req.setReportDate(today);
        req.setGrossSales(new BigDecimal("15000.00"));
        req.setCoversCount(50);

        DailySalesReport saved = dsrService.create(tenantId, userId, req);

        assertThat(saved.getReportDate()).isEqualTo(today);
        assertThat(saved.getGrossSales()).isEqualByComparingTo(new BigDecimal("15000.00"));
        assertThat(saved.getCoversCount()).isEqualTo(50);
    }

    @Test
    void testCreate_duplicateDate_throwsConflictException() {
        LocalDate today = LocalDate.now();
        DailySalesReport existing = DailySalesReport.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).reportDate(today).build();

        when(dsrRepository.findByTenantIdAndReportDate(tenantId, today))
                .thenReturn(Optional.of(existing));

        CreateDsrRequest req = new CreateDsrRequest();
        req.setReportDate(today);

        assertThatThrownBy(() -> dsrService.create(tenantId, userId, req))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining(today.toString());

        verify(dsrRepository, never()).save(any());
    }

    // ── reconcile ─────────────────────────────────────────────────────────────

    @Test
    void testReconcile_cashMatchesExpected_noDiscrepancyEvent() {
        UUID dsrId = UUID.randomUUID();
        DailySalesReport dsr = DailySalesReport.builder()
                .id(dsrId).tenantId(tenantId)
                .cashSales(new BigDecimal("5000.00"))
                .build();

        when(dsrRepository.findByIdAndTenantId(dsrId, tenantId)).thenReturn(Optional.of(dsr));
        when(dsrRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Actual = expected → no discrepancy
        dsrService.reconcile(tenantId, dsrId, new BigDecimal("5000.00"));

        verify(eventPublisher, never()).publishCashDiscrepancy(any(), any(), any(), any());
        assertThat(dsr.getCashOverShort()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void testReconcile_cashDiscrepancyAboveThreshold_publishesDiscrepancyEvent() {
        UUID dsrId = UUID.randomUUID();
        DailySalesReport dsr = DailySalesReport.builder()
                .id(dsrId).tenantId(tenantId)
                .cashSales(new BigDecimal("5000.00"))
                .build();

        when(dsrRepository.findByIdAndTenantId(dsrId, tenantId)).thenReturn(Optional.of(dsr));
        when(dsrRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Variance = 5000 - 4850 = -150 (> threshold of 10)
        dsrService.reconcile(tenantId, dsrId, new BigDecimal("4850.00"));

        verify(eventPublisher).publishCashDiscrepancy(eq(dsr), eq(new BigDecimal("5000.00")),
                eq(new BigDecimal("4850.00")), any());
        assertThat(dsr.isRequiresInvestigation()).isTrue();
    }

    @Test
    void testReconcile_cashDiscrepancyBelowThreshold_noEvent() {
        UUID dsrId = UUID.randomUUID();
        DailySalesReport dsr = DailySalesReport.builder()
                .id(dsrId).tenantId(tenantId)
                .cashSales(new BigDecimal("5000.00"))
                .build();

        when(dsrRepository.findByIdAndTenantId(dsrId, tenantId)).thenReturn(Optional.of(dsr));
        when(dsrRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Variance = 5000 - 4995 = -5 (< threshold of 10)
        dsrService.reconcile(tenantId, dsrId, new BigDecimal("4995.00"));

        verify(eventPublisher, never()).publishCashDiscrepancy(any(), any(), any(), any());
        assertThat(dsr.isRequiresInvestigation()).isFalse();
    }

    // ── average check size ────────────────────────────────────────────────────

    @Test
    void testAverageCheckSize_dividesByGuestCount() {
        DailySalesReport dsr = DailySalesReport.builder()
                .tenantId(tenantId)
                .grossSales(new BigDecimal("10000.00"))
                .coversCount(100)
                .build();

        // averageCheckSize = 10000 / 100 = 100.00
        assertThat(dsr.getAverageCheckSize()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void testAverageCheckSize_zeroGuests_returnsZero() {
        DailySalesReport dsr = DailySalesReport.builder()
                .tenantId(tenantId)
                .grossSales(new BigDecimal("5000.00"))
                .coversCount(0)
                .build();

        // Zero guests → no division, returns 0
        assertThat(dsr.getAverageCheckSize()).isEqualByComparingTo(BigDecimal.ZERO);
    }
}
