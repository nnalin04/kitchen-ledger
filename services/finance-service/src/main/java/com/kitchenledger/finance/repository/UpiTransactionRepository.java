package com.kitchenledger.finance.repository;

import com.kitchenledger.finance.model.UpiTransaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UpiTransactionRepository extends JpaRepository<UpiTransaction, UUID> {

    Optional<UpiTransaction> findByTransactionRef(String ref);

    List<UpiTransaction> findByTenantIdAndReportDate(UUID tenantId, LocalDate date);

    Optional<UpiTransaction> findByTransactionRefAndStatus(String ref, String status);
}
