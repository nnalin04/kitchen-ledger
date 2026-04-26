package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.TipPoolDistribution;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface TipPoolDistributionRepository extends JpaRepository<TipPoolDistribution, UUID> {
    List<TipPoolDistribution> findByTipPoolIdAndTenantId(UUID tipPoolId, UUID tenantId);

    void deleteByTipPoolId(UUID tipPoolId);
}
