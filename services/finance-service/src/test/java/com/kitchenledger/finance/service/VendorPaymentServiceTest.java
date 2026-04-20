package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.request.CreateVendorPaymentRequest;
import com.kitchenledger.finance.exception.ResourceNotFoundException;
import com.kitchenledger.finance.model.Vendor;
import com.kitchenledger.finance.model.VendorPayment;
import com.kitchenledger.finance.model.enums.PaymentMethod;
import com.kitchenledger.finance.repository.VendorPaymentRepository;
import com.kitchenledger.finance.repository.VendorRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VendorPaymentServiceTest {

    @Mock private VendorPaymentRepository paymentRepository;
    @Mock private VendorRepository vendorRepository;

    @InjectMocks
    private VendorPaymentService vendorPaymentService;

    private final UUID tenantId  = UUID.randomUUID();
    private final UUID vendorId  = UUID.randomUUID();
    private final UUID userId    = UUID.randomUUID();

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void testCreate_pendingStatus_savesWithPendingStatus() {
        Vendor vendor = Vendor.builder()
                .id(vendorId).tenantId(tenantId).name("Spice Trader")
                .outstandingBalance(new BigDecimal("5000.00"))
                .build();

        when(vendorRepository.findByIdAndTenantIdAndDeletedAtIsNull(vendorId, tenantId))
                .thenReturn(Optional.of(vendor));
        when(vendorRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(paymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        CreateVendorPaymentRequest req = new CreateVendorPaymentRequest();
        req.setVendorId(vendorId);
        req.setAmount(new BigDecimal("2000.00"));
        req.setPaymentDate(LocalDate.now());
        req.setPaymentMethod(PaymentMethod.bank_transfer);
        req.setPaymentStatus("pending");
        req.setDueDate(LocalDate.now().plusDays(30));

        VendorPayment saved = vendorPaymentService.create(tenantId, userId, req);

        assertThat(saved.getPaymentStatus()).isEqualTo("pending");
        assertThat(saved.getAmount()).isEqualByComparingTo(new BigDecimal("2000.00"));
    }

    // ── markPaid ──────────────────────────────────────────────────────────────

    @Test
    void testMarkPaid_updatesStatusToPayd_andSetsPaymentDate() {
        UUID paymentId = UUID.randomUUID();
        VendorPayment payment = VendorPayment.builder()
                .id(paymentId).tenantId(tenantId).vendorId(vendorId)
                .amount(new BigDecimal("1500.00"))
                .paymentStatus("pending")
                .paymentDate(null)
                .paymentMethod(PaymentMethod.cash)
                .createdBy(userId)
                .build();

        when(paymentRepository.findByIdAndTenantId(paymentId, tenantId))
                .thenReturn(Optional.of(payment));
        when(paymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        VendorPayment result = vendorPaymentService.markPaid(tenantId, paymentId);

        assertThat(result.getPaymentStatus()).isEqualTo("paid");
        assertThat(result.getPaymentDate()).isNotNull();
    }

    @Test
    void testMarkPaid_unknownPayment_throwsResourceNotFoundException() {
        UUID unknownId = UUID.randomUUID();
        when(paymentRepository.findByIdAndTenantId(unknownId, tenantId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> vendorPaymentService.markPaid(tenantId, unknownId))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // ── getOverdue ────────────────────────────────────────────────────────────

    @Test
    void testGetOverdue_returnsOnlyPastDueDatePayments() {
        VendorPayment overdue = VendorPayment.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).vendorId(vendorId)
                .paymentStatus("pending")
                .dueDate(LocalDate.now().minusDays(5))
                .amount(new BigDecimal("3000.00"))
                .paymentMethod(PaymentMethod.upi)
                .createdBy(userId)
                .paymentDate(LocalDate.now().minusDays(5))
                .build();

        when(paymentRepository.findOverdue(eq(tenantId), any(LocalDate.class)))
                .thenReturn(List.of(overdue));

        List<VendorPayment> result = vendorPaymentService.getOverdue(tenantId);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getDueDate()).isBefore(LocalDate.now());
        assertThat(result.get(0).getPaymentStatus()).isEqualTo("pending");
    }
}
