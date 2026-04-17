package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.Recipe;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecipeRepository extends JpaRepository<Recipe, UUID> {

    Optional<Recipe> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    List<Recipe> findByTenantIdAndDeletedAtIsNull(UUID tenantId);

    boolean existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID tenantId, String name);
}
