package com.kitchenledger.finance.job;

import com.kitchenledger.finance.event.FinanceEventPublisher;
import com.kitchenledger.finance.model.VendorPayment;
import com.kitchenledger.finance.repository.VendorPaymentRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OverduePaymentJobTest {

    @Mock private VendorPaymentRepository vendorPaymentRepository;
    @Mock private FinanceEventPublisher    eventPublisher;

    @InjectMocks
    private OverduePaymentJob overduePaymentJob;

    private VendorPayment pendingOverdue(UUID tenantId) {
        return VendorPayment.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .vendorId(UUID.randomUUID())
                .amount(new BigDecimal("3500.00"))
                .paymentDate(LocalDate.now().minusDays(5))
                .dueDate(LocalDate.now().minusDays(1))
                .paymentStatus("pending")
                .createdBy(UUID.randomUUID())
                .build();
    }

    // ── runCheck ──────────────────────────────────────────────────────────────

    @Test
    void runCheck_overduePayment_marksAsOverdueAndPublishesEvent() {
        UUID tenantId = UUID.randomUUID();
        VendorPayment vp = pendingOverdue(tenantId);
        when(vendorPaymentRepository.findDistinctTenantsWithOverdue(any(LocalDate.class)))
                .thenReturn(List.of(tenantId));
        when(vendorPaymentRepository.findOverdue(any(UUID.class), any(LocalDate.class)))
                .thenReturn(List.of(vp));
        when(vendorPaymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        overduePaymentJob.runCheck();

        ArgumentCaptor<VendorPayment> captor = ArgumentCaptor.forClass(VendorPayment.class);
        verify(vendorPaymentRepository).save(captor.capture());
        assertThat(captor.getValue().getPaymentStatus()).isEqualTo("overdue");

        verify(eventPublisher).publishPaymentOverdue(vp);
    }

    @Test
    void runCheck_noOverduePayments_noSaveOrPublish() {
        when(vendorPaymentRepository.findDistinctTenantsWithOverdue(any(LocalDate.class)))
                .thenReturn(List.of());

        overduePaymentJob.runCheck();

        verify(vendorPaymentRepository, never()).save(any());
        verify(eventPublisher, never()).publishPaymentOverdue(any());
    }

    @Test
    void runCheck_multipleOverdue_allMarkedAndPublished() {
        UUID tenantId = UUID.randomUUID();
        VendorPayment vp1 = pendingOverdue(tenantId);
        VendorPayment vp2 = pendingOverdue(tenantId);
        when(vendorPaymentRepository.findDistinctTenantsWithOverdue(any(LocalDate.class)))
                .thenReturn(List.of(tenantId));
        when(vendorPaymentRepository.findOverdue(any(UUID.class), any(LocalDate.class)))
                .thenReturn(List.of(vp1, vp2));
        when(vendorPaymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        overduePaymentJob.runCheck();

        verify(vendorPaymentRepository, times(2)).save(any());
        verify(eventPublisher, times(2)).publishPaymentOverdue(any());
    }

    @Test
    void runCheck_passesTodayToRepository() {
        when(vendorPaymentRepository.findDistinctTenantsWithOverdue(any(LocalDate.class)))
                .thenReturn(List.of());

        overduePaymentJob.runCheck();

        ArgumentCaptor<LocalDate> dateCaptor = ArgumentCaptor.forClass(LocalDate.class);
        verify(vendorPaymentRepository).findDistinctTenantsWithOverdue(dateCaptor.capture());
        assertThat(dateCaptor.getValue()).isEqualTo(LocalDate.now());
    }
}
