package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.InventoryCategory;
import com.kitchenledger.inventory.repository.InventoryCategoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InventoryCategoryService {

    private final InventoryCategoryRepository categoryRepository;

    @Transactional(readOnly = true)
    public List<InventoryCategory> listByTenant(UUID tenantId) {
        return categoryRepository.findByTenantIdAndDeletedAtIsNullOrderBySortOrderAsc(tenantId);
    }

    @Transactional(readOnly = true)
    public InventoryCategory getById(UUID tenantId, UUID id) {
        return categoryRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + id));
    }

    @Transactional
    public InventoryCategory create(UUID tenantId, String name, UUID parentId, int sortOrder) {
        if (categoryRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, name)) {
            throw new ConflictException("Category already exists: " + name);
        }
        InventoryCategory category = InventoryCategory.builder()
                .tenantId(tenantId)
                .name(name)
                .parentId(parentId)
                .sortOrder(sortOrder)
                .build();
        return categoryRepository.save(category);
    }

    @Transactional
    public InventoryCategory update(UUID tenantId, UUID id, String name, UUID parentId, Integer sortOrder) {
        InventoryCategory category = getById(tenantId, id);
        if (name != null) {
            if (!name.equals(category.getName())
                    && categoryRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, name)) {
                throw new ConflictException("Category name already in use: " + name);
            }
            category.setName(name);
        }
        if (parentId != null) category.setParentId(parentId);
        if (sortOrder != null) category.setSortOrder(sortOrder);
        return categoryRepository.save(category);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        InventoryCategory category = getById(tenantId, id);
        category.setDeletedAt(Instant.now());
        categoryRepository.save(category);
    }
}
