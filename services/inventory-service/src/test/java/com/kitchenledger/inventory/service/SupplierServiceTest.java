package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreateSupplierRequest;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.Supplier;
import com.kitchenledger.inventory.model.enums.PurchaseOrderStatus;
import com.kitchenledger.inventory.repository.PurchaseOrderRepository;
import com.kitchenledger.inventory.repository.SupplierRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SupplierServiceTest {

    @Mock private SupplierRepository supplierRepository;
    @Mock private PurchaseOrderRepository purchaseOrderRepository;

    @InjectMocks
    private SupplierService supplierService;

    private final UUID tenantId    = UUID.randomUUID();
    private final UUID supplierId  = UUID.randomUUID();

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void testCreate_duplicateName_throwsConflictException() {
        when(supplierRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, "Fresh Farms"))
                .thenReturn(true);

        CreateSupplierRequest req = new CreateSupplierRequest();
        req.setName("Fresh Farms");

        assertThatThrownBy(() -> supplierService.create(tenantId, req))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("Fresh Farms");

        verify(supplierRepository, never()).save(any());
    }

    // ── delete ────────────────────────────────────────────────────────────────

    @Test
    void testDelete_withOpenPurchaseOrders_throwsValidationException() {
        Supplier supplier = Supplier.builder()
                .id(supplierId).tenantId(tenantId).name("Veggie World")
                .active(true)
                .build();

        when(supplierRepository.findByIdAndTenantIdAndDeletedAtIsNull(supplierId, tenantId))
                .thenReturn(Optional.of(supplier));

        List<PurchaseOrderStatus> openStatuses = List.of(
                PurchaseOrderStatus.draft, PurchaseOrderStatus.sent,
                PurchaseOrderStatus.partial, PurchaseOrderStatus.received
        );
        when(purchaseOrderRepository.existsByTenantIdAndSupplierIdAndDeletedAtIsNullAndStatusIn(
                tenantId, supplierId, openStatuses))
                .thenReturn(true);

        assertThatThrownBy(() -> supplierService.delete(tenantId, supplierId))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("open purchase orders");

        verify(supplierRepository, never()).save(any());
    }

    @Test
    void testDelete_noOpenPurchaseOrders_softDeletesSupplier() {
        Supplier supplier = Supplier.builder()
                .id(supplierId).tenantId(tenantId).name("Closed Supplier")
                .active(true)
                .build();

        when(supplierRepository.findByIdAndTenantIdAndDeletedAtIsNull(supplierId, tenantId))
                .thenReturn(Optional.of(supplier));
        when(purchaseOrderRepository.existsByTenantIdAndSupplierIdAndDeletedAtIsNullAndStatusIn(
                eq(tenantId), eq(supplierId), any()))
                .thenReturn(false);
        when(supplierRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        supplierService.delete(tenantId, supplierId);

        assertThat(supplier.isActive()).isFalse();
        assertThat(supplier.getDeletedAt()).isNotNull();
        verify(supplierRepository).save(supplier);
    }
}
