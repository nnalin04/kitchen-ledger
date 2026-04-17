package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreateRecipeRequest;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.Recipe;
import com.kitchenledger.inventory.model.RecipeIngredient;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.RecipeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RecipeService {

    private final RecipeRepository recipeRepository;
    private final InventoryItemRepository itemRepository;

    @Transactional(readOnly = true)
    public List<Recipe> listByTenant(UUID tenantId) {
        return recipeRepository.findByTenantIdAndDeletedAtIsNull(tenantId);
    }

    @Transactional(readOnly = true)
    public Recipe getById(UUID tenantId, UUID id) {
        return recipeRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Recipe not found: " + id));
    }

    @Transactional
    public Recipe create(UUID tenantId, CreateRecipeRequest req) {
        if (recipeRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, req.getName())) {
            throw new ConflictException("Recipe already exists: " + req.getName());
        }

        Recipe recipe = Recipe.builder()
                .tenantId(tenantId)
                .name(req.getName())
                .category(req.getCategory())
                .menuPrice(req.getMenuPrice())
                .servingSize(req.getServingSize())
                .servingUnit(req.getServingUnit())
                .prepTimeMinutes(req.getPrepTimeMinutes())
                .cookTimeMinutes(req.getCookTimeMinutes())
                .yieldPercent(req.getYieldPercent())
                .notes(req.getNotes())
                .imageUrl(req.getImageUrl())
                .ingredients(new ArrayList<>())
                .build();

        applyIngredients(recipe, tenantId, req.getIngredients());
        recipe.recalculateCost();
        return recipeRepository.save(recipe);
    }

    @Transactional
    public Recipe update(UUID tenantId, UUID id, CreateRecipeRequest req) {
        Recipe recipe = getById(tenantId, id);

        if (!recipe.getName().equalsIgnoreCase(req.getName())
                && recipeRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, req.getName())) {
            throw new ConflictException("Recipe name already in use: " + req.getName());
        }

        recipe.setName(req.getName());
        recipe.setCategory(req.getCategory());
        recipe.setMenuPrice(req.getMenuPrice());
        recipe.setServingSize(req.getServingSize());
        recipe.setServingUnit(req.getServingUnit());
        recipe.setPrepTimeMinutes(req.getPrepTimeMinutes());
        recipe.setCookTimeMinutes(req.getCookTimeMinutes());
        recipe.setYieldPercent(req.getYieldPercent());
        recipe.setNotes(req.getNotes());
        recipe.setImageUrl(req.getImageUrl());

        recipe.getIngredients().clear();
        applyIngredients(recipe, tenantId, req.getIngredients());
        recipe.recalculateCost();
        return recipeRepository.save(recipe);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Recipe recipe = getById(tenantId, id);
        recipe.setDeletedAt(Instant.now());
        recipe.setActive(false);
        recipeRepository.save(recipe);
    }

    /**
     * Builds RecipeIngredient entities, resolving unit_cost from inventory item avgCost.
     */
    private void applyIngredients(Recipe recipe, UUID tenantId,
                                   List<CreateRecipeRequest.IngredientRequest> requests) {
        for (CreateRecipeRequest.IngredientRequest ing : requests) {
            BigDecimal unitCost = BigDecimal.ZERO;

            if (ing.getInventoryItemId() != null) {
                unitCost = itemRepository
                        .findByIdAndTenantIdAndDeletedAtIsNull(ing.getInventoryItemId(), tenantId)
                        .map(InventoryItem::getAvgCost)
                        .orElse(BigDecimal.ZERO);
            }

            RecipeIngredient ingredient = RecipeIngredient.builder()
                    .recipeId(recipe.getId())   // null on first save — JPA sets via @JoinColumn
                    .inventoryItemId(ing.getInventoryItemId())
                    .subRecipeId(ing.getSubRecipeId())
                    .quantity(ing.getQuantity())
                    .unit(ing.getUnit())
                    .wastePercent(ing.getWastePercent())
                    .unitCost(unitCost)
                    .sortOrder(ing.getSortOrder())
                    .build();

            ingredient.recalculateLineCost();
            recipe.getIngredients().add(ingredient);
        }
    }
}
