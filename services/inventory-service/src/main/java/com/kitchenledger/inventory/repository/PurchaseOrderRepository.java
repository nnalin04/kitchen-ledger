package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.PurchaseOrder;
import com.kitchenledger.inventory.model.enums.PurchaseOrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, UUID> {

    Optional<PurchaseOrder> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    Page<PurchaseOrder> findByTenantIdAndDeletedAtIsNull(UUID tenantId, Pageable pageable);

    Page<PurchaseOrder> findByTenantIdAndStatusAndDeletedAtIsNull(
            UUID tenantId, PurchaseOrderStatus status, Pageable pageable);

    boolean existsByTenantIdAndPoNumber(UUID tenantId, String poNumber);

    /** Latest PO number to derive the next one. */
    Optional<PurchaseOrder> findTopByTenantIdOrderByCreatedAtDesc(UUID tenantId);
}
