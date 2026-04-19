package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.StockTransfer;
import com.kitchenledger.inventory.model.enums.TransferStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface StockTransferRepository extends JpaRepository<StockTransfer, UUID> {
    Optional<StockTransfer> findByIdAndTenantId(UUID id, UUID tenantId);
    Page<StockTransfer> findByTenantId(UUID tenantId, Pageable pageable);
    Page<StockTransfer> findByTenantIdAndStatus(UUID tenantId, TransferStatus status, Pageable pageable);
    Page<StockTransfer> findByTenantIdAndTransferDateBetween(UUID tenantId, LocalDate startDate, LocalDate endDate, Pageable pageable);
}
