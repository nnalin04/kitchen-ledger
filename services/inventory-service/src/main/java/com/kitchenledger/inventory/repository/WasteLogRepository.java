package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.WasteLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface WasteLogRepository extends JpaRepository<WasteLog, UUID> {

    Page<WasteLog> findByTenantIdOrderByLoggedAtDesc(UUID tenantId, Pageable pageable);

    List<WasteLog> findByTenantIdAndLoggedAtBetweenOrderByLoggedAtDesc(
            UUID tenantId, Instant from, Instant to);

    @Query("""
        SELECT COALESCE(SUM(w.estimatedCost), 0)
        FROM WasteLog w
        WHERE w.tenantId = :tenantId
          AND w.loggedAt >= :from AND w.loggedAt < :to
        """)
    java.math.BigDecimal sumEstimatedCostByPeriod(
            @Param("tenantId") UUID tenantId,
            @Param("from") Instant from,
            @Param("to") Instant to);
}
