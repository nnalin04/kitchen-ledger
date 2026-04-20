package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreateRecipeRequest;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.Recipe;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.RecipeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RecipeServiceTest {

    @Mock private RecipeRepository recipeRepository;
    @Mock private InventoryItemRepository itemRepository;

    @InjectMocks
    private RecipeService recipeService;

    private final UUID tenantId = UUID.randomUUID();

    // ── cost calculation ──────────────────────────────────────────────────────

    @Test
    void testCreate_costCalculation_sumsIngredientLineCosts() {
        UUID itemId1 = UUID.randomUUID();
        UUID itemId2 = UUID.randomUUID();

        InventoryItem flour = InventoryItem.builder()
                .id(itemId1).tenantId(tenantId).avgCost(new BigDecimal("2.00")).build();
        InventoryItem egg = InventoryItem.builder()
                .id(itemId2).tenantId(tenantId).avgCost(new BigDecimal("5.00")).build();

        when(recipeRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(eq(tenantId), any()))
                .thenReturn(false);
        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId1, tenantId))
                .thenReturn(Optional.of(flour));
        when(itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId2, tenantId))
                .thenReturn(Optional.of(egg));
        when(recipeRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        CreateRecipeRequest req = buildRequest("Pancakes", List.of(
                ingredient(itemId1, null, new BigDecimal("0.500"), BigDecimal.ZERO),  // 0.5kg * 2.00 = 1.00
                ingredient(itemId2, null, new BigDecimal("2.000"), BigDecimal.ZERO)   // 2 * 5.00 = 10.00
        ));

        Recipe saved = recipeService.create(tenantId, req);

        // total cost = 1.00 + 10.00 = 11.00
        assertThat(saved.getTotalCost()).isEqualByComparingTo(new BigDecimal("11.0000"));
    }

    @Test
    void testCreate_subRecipeIngredient_costIsZeroWhenNoItemId() {
        UUID subRecipeId = UUID.randomUUID();

        when(recipeRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(eq(tenantId), any()))
                .thenReturn(false);
        when(recipeRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        CreateRecipeRequest req = buildRequest("Burger", List.of(
                ingredient(null, subRecipeId, new BigDecimal("1.000"), BigDecimal.ZERO)
        ));

        Recipe saved = recipeService.create(tenantId, req);

        // sub-recipe ingredient has unitCost = 0 (no item lookup) → lineCost = 0
        assertThat(saved.getTotalCost()).isEqualByComparingTo(BigDecimal.ZERO);
        verify(itemRepository, never()).findByIdAndTenantIdAndDeletedAtIsNull(any(), any());
    }

    // ── XOR constraint ────────────────────────────────────────────────────────

    @Test
    void testCreate_ingredientAndSubRecipeOnSameItem_throwsValidationException() {
        UUID itemId      = UUID.randomUUID();
        UUID subRecipeId = UUID.randomUUID();

        when(recipeRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(eq(tenantId), any()))
                .thenReturn(false);

        CreateRecipeRequest req = buildRequest("BadRecipe", List.of(
                // Both inventoryItemId AND subRecipeId set — XOR violation
                ingredient(itemId, subRecipeId, new BigDecimal("1.000"), BigDecimal.ZERO)
        ));

        assertThatThrownBy(() -> recipeService.create(tenantId, req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("exactly one");

        verify(recipeRepository, never()).save(any());
    }

    @Test
    void testCreate_ingredientWithNeitherItemNorSubRecipe_throwsValidationException() {
        when(recipeRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(eq(tenantId), any()))
                .thenReturn(false);

        CreateRecipeRequest req = buildRequest("BadRecipe2", List.of(
                ingredient(null, null, new BigDecimal("1.000"), BigDecimal.ZERO)
        ));

        assertThatThrownBy(() -> recipeService.create(tenantId, req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("exactly one");
    }

    // ── soft delete ───────────────────────────────────────────────────────────

    @Test
    void testDelete_setsDeletedAtAndDeactivates() {
        UUID recipeId = UUID.randomUUID();
        Recipe recipe = Recipe.builder()
                .id(recipeId).tenantId(tenantId).name("Pasta")
                .active(true).ingredients(new ArrayList<>())
                .build();

        when(recipeRepository.findByIdAndTenantIdAndDeletedAtIsNull(recipeId, tenantId))
                .thenReturn(Optional.of(recipe));
        when(recipeRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        recipeService.delete(tenantId, recipeId);

        assertThat(recipe.getDeletedAt()).isNotNull();
        assertThat(recipe.isActive()).isFalse();
        verify(recipeRepository).save(recipe);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private CreateRecipeRequest buildRequest(String name,
                                              List<CreateRecipeRequest.IngredientRequest> ings) {
        CreateRecipeRequest req = new CreateRecipeRequest();
        req.setName(name);
        req.setMenuPrice(new BigDecimal("100.00"));
        req.setYieldPercent(new BigDecimal("100.00"));
        req.setIngredients(ings);
        return req;
    }

    private CreateRecipeRequest.IngredientRequest ingredient(UUID inventoryItemId,
                                                              UUID subRecipeId,
                                                              BigDecimal quantity,
                                                              BigDecimal wastePercent) {
        CreateRecipeRequest.IngredientRequest ing = new CreateRecipeRequest.IngredientRequest();
        ing.setInventoryItemId(inventoryItemId);
        ing.setSubRecipeId(subRecipeId);
        ing.setQuantity(quantity);
        ing.setUnit("kg");
        ing.setWastePercent(wastePercent);
        return ing;
    }
}
