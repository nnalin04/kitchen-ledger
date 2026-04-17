package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.StockReceipt;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface StockReceiptRepository extends JpaRepository<StockReceipt, UUID> {

    Optional<StockReceipt> findByIdAndTenantId(UUID id, UUID tenantId);

    Page<StockReceipt> findByTenantId(UUID tenantId, Pageable pageable);
}
