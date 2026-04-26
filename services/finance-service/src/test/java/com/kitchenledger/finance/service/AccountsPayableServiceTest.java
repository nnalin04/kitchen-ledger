package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.response.APAgingEntry;
import com.kitchenledger.finance.dto.response.APAgingResponse;
import com.kitchenledger.finance.model.Vendor;
import com.kitchenledger.finance.model.VendorPayment;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccountsPayableServiceTest {

    @Mock private VendorPaymentRepository vendorPaymentRepository;
    @Mock private VendorRepository vendorRepository;

    @InjectMocks
    private AccountsPayableService apService;

    private final UUID tenantId = UUID.randomUUID();

    // ── Helpers ────────────────────────────────────────────────────────────────

    private VendorPayment payment(UUID vendorId, BigDecimal amount,
                                   String status, LocalDate dueDate) {
        return VendorPayment.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .vendorId(vendorId)
                .amount(amount)
                .paymentStatus(status)
                .paymentDate(LocalDate.now().minusDays(60))
                .dueDate(dueDate)
                .createdBy(UUID.randomUUID())
                .build();
    }

    private void stubVendorName(UUID vendorId, String name) {
        when(vendorRepository.findByIdAndTenantIdAndDeletedAtIsNull(eq(vendorId), eq(tenantId)))
                .thenReturn(Optional.of(Vendor.builder()
                        .id(vendorId)
                        .tenantId(tenantId)
                        .name(name)
                        .build()));
    }

    // ── Aging bucket tests ────────────────────────────────────────────────────

    @Test
    void payment45DaysOld_bucketedIn31to60() {
        UUID vendorId = UUID.randomUUID();
        LocalDate dueDate = LocalDate.now().minusDays(45);

        VendorPayment vp = payment(vendorId, new BigDecimal("1000.00"), "overdue", dueDate);
        when(vendorPaymentRepository.findUnpaidByTenant(tenantId)).thenReturn(List.of(vp));
        stubVendorName(vendorId, "Supplier A");

        APAgingResponse result = apService.getSummary(tenantId);

        assertThat(result.getVendors()).hasSize(1);
        APAgingEntry entry = result.getVendors().get(0);
        assertThat(entry.getDays31to60()).isEqualByComparingTo("1000.00");
        assertThat(entry.getCurrent()).isEqualByComparingTo("0.00");
        assertThat(entry.getDays61to90()).isEqualByComparingTo("0.00");
        assertThat(entry.getDays90plus()).isEqualByComparingTo("0.00");
    }

    @Test
    void paymentDueTomorrow_bucketedAsCurrent() {
        UUID vendorId = UUID.randomUUID();
        LocalDate dueDate = LocalDate.now().plusDays(1); // not yet due → 0 days old

        VendorPayment vp = payment(vendorId, new BigDecimal("500.00"), "pending", dueDate);
        when(vendorPaymentRepository.findUnpaidByTenant(tenantId)).thenReturn(List.of(vp));
        stubVendorName(vendorId, "Supplier B");

        APAgingResponse result = apService.getSummary(tenantId);

        APAgingEntry entry = result.getVendors().get(0);
        assertThat(entry.getCurrent()).isEqualByComparingTo("500.00");
        assertThat(entry.getDays31to60()).isEqualByComparingTo("0.00");
    }

    @Test
    void payment95DaysOld_bucketedIn90Plus() {
        UUID vendorId = UUID.randomUUID();
        LocalDate dueDate = LocalDate.now().minusDays(95);

        VendorPayment vp = payment(vendorId, new BigDecimal("2000.00"), "overdue", dueDate);
        when(vendorPaymentRepository.findUnpaidByTenant(tenantId)).thenReturn(List.of(vp));
        stubVendorName(vendorId, "Supplier C");

        APAgingResponse result = apService.getSummary(tenantId);

        APAgingEntry entry = result.getVendors().get(0);
        assertThat(entry.getDays90plus()).isEqualByComparingTo("2000.00");
    }

    // ── Multiple vendors ──────────────────────────────────────────────────────

    @Test
    void multipleVendors_perVendorRowsCorrect() {
        UUID vendor1 = UUID.randomUUID();
        UUID vendor2 = UUID.randomUUID();

        VendorPayment vp1 = payment(vendor1, new BigDecimal("1000.00"), "pending",
                LocalDate.now().minusDays(10)); // current
        VendorPayment vp2 = payment(vendor2, new BigDecimal("3000.00"), "overdue",
                LocalDate.now().minusDays(45)); // 31-60

        when(vendorPaymentRepository.findUnpaidByTenant(tenantId)).thenReturn(List.of(vp1, vp2));
        stubVendorName(vendor1, "Vendor One");
        stubVendorName(vendor2, "Vendor Two");

        APAgingResponse result = apService.getSummary(tenantId);

        assertThat(result.getVendors()).hasSize(2);

        APAgingEntry e1 = result.getVendors().stream()
                .filter(e -> "Vendor One".equals(e.getVendorName()))
                .findFirst().orElseThrow();
        APAgingEntry e2 = result.getVendors().stream()
                .filter(e -> "Vendor Two".equals(e.getVendorName()))
                .findFirst().orElseThrow();

        assertThat(e1.getCurrent()).isEqualByComparingTo("1000.00");
        assertThat(e2.getDays31to60()).isEqualByComparingTo("3000.00");
    }

    // ── Total outstanding ─────────────────────────────────────────────────────

    @Test
    void getTotalOutstanding_equalsSum_of_allUnpaidExpenses() {
        UUID vendorId = UUID.randomUUID();

        VendorPayment vp1 = payment(vendorId, new BigDecimal("1000.00"), "pending",
                LocalDate.now().minusDays(5));
        VendorPayment vp2 = payment(vendorId, new BigDecimal("2500.00"), "overdue",
                LocalDate.now().minusDays(50));

        when(vendorPaymentRepository.findUnpaidByTenant(tenantId)).thenReturn(List.of(vp1, vp2));
        stubVendorName(vendorId, "Supplier D");

        APAgingResponse result = apService.getSummary(tenantId);

        assertThat(result.getTotalOutstanding()).isEqualByComparingTo("3500.00");
    }

    @Test
    void totalOverdue_onlyCountsOverdueStatus() {
        UUID vendorId = UUID.randomUUID();

        VendorPayment pending = payment(vendorId, new BigDecimal("1000.00"), "pending",
                LocalDate.now().plusDays(10));
        VendorPayment overdue = payment(vendorId, new BigDecimal("2000.00"), "overdue",
                LocalDate.now().minusDays(15));

        when(vendorPaymentRepository.findUnpaidByTenant(tenantId)).thenReturn(List.of(pending, overdue));
        stubVendorName(vendorId, "Supplier E");

        APAgingResponse result = apService.getSummary(tenantId);

        assertThat(result.getTotalOutstanding()).isEqualByComparingTo("3000.00");
        assertThat(result.getTotalOverdue()).isEqualByComparingTo("2000.00");
    }

    @Test
    void noUnpaidPayments_returnsZeroTotalsAndEmptyList() {
        when(vendorPaymentRepository.findUnpaidByTenant(tenantId)).thenReturn(List.of());

        APAgingResponse result = apService.getSummary(tenantId);

        assertThat(result.getTotalOutstanding()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.getTotalOverdue()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.getDueSoon()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.getVendors()).isEmpty();
    }

    @Test
    void dueSoon_includesPaymentsDueWithin7Days() {
        UUID vendorId = UUID.randomUUID();

        VendorPayment dueSoon     = payment(vendorId, new BigDecimal("500.00"), "pending",
                LocalDate.now().plusDays(3));   // 3 days from now → dueSoon
        VendorPayment notDueSoon  = payment(vendorId, new BigDecimal("999.00"), "pending",
                LocalDate.now().plusDays(14));  // 14 days out → not dueSoon

        when(vendorPaymentRepository.findUnpaidByTenant(tenantId)).thenReturn(List.of(dueSoon, notDueSoon));
        stubVendorName(vendorId, "Supplier F");

        APAgingResponse result = apService.getSummary(tenantId);

        assertThat(result.getDueSoon()).isEqualByComparingTo("500.00");
    }
}
