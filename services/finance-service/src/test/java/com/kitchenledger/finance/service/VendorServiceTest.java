package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.request.CreateVendorRequest;
import com.kitchenledger.finance.exception.ConflictException;
import com.kitchenledger.finance.exception.ValidationException;
import com.kitchenledger.finance.model.Vendor;
import com.kitchenledger.finance.repository.VendorRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VendorServiceTest {

    @Mock private VendorRepository vendorRepository;

    @InjectMocks
    private VendorService vendorService;

    private final UUID tenantId  = UUID.randomUUID();
    private final UUID vendorId  = UUID.randomUUID();

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void testCreate_duplicateName_throwsConflictException() {
        when(vendorRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, "City Distributors"))
                .thenReturn(true);

        CreateVendorRequest req = new CreateVendorRequest();
        req.setName("City Distributors");

        assertThatThrownBy(() -> vendorService.create(tenantId, req))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("City Distributors");

        verify(vendorRepository, never()).save(any());
    }

    // ── delete ────────────────────────────────────────────────────────────────

    @Test
    void testDelete_withOutstandingPayments_throwsValidationException() {
        Vendor vendor = Vendor.builder()
                .id(vendorId).tenantId(tenantId).name("Outstanding Vendor")
                .outstandingBalance(new BigDecimal("12500.00"))
                .active(true)
                .build();

        when(vendorRepository.findByIdAndTenantIdAndDeletedAtIsNull(vendorId, tenantId))
                .thenReturn(Optional.of(vendor));

        assertThatThrownBy(() -> vendorService.delete(tenantId, vendorId))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("outstanding balance");

        verify(vendorRepository, never()).save(any());
    }

    @Test
    void testDelete_zeroOutstanding_softDeletesVendor() {
        Vendor vendor = Vendor.builder()
                .id(vendorId).tenantId(tenantId).name("Settled Vendor")
                .outstandingBalance(BigDecimal.ZERO)
                .active(true)
                .build();

        when(vendorRepository.findByIdAndTenantIdAndDeletedAtIsNull(vendorId, tenantId))
                .thenReturn(Optional.of(vendor));
        when(vendorRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        vendorService.delete(tenantId, vendorId);

        assertThat(vendor.isActive()).isFalse();
        assertThat(vendor.getDeletedAt()).isNotNull();
    }
}
