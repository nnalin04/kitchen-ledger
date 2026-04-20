package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.PoSuggestion;
import com.kitchenledger.inventory.model.enums.PoSuggestionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface PoSuggestionRepository extends JpaRepository<PoSuggestion, UUID> {

    Optional<PoSuggestion> findByIdAndTenantId(UUID id, UUID tenantId);

    Page<PoSuggestion> findByTenantIdAndStatus(UUID tenantId, PoSuggestionStatus status, Pageable pageable);

    Page<PoSuggestion> findByTenantId(UUID tenantId, Pageable pageable);

    /** Guard: skip suggestion if a pending one already exists for this item. */
    boolean existsByTenantIdAndInventoryItemIdAndStatus(
            UUID tenantId, UUID inventoryItemId, PoSuggestionStatus status);
}
