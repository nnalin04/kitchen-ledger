package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.model.InventoryCount;
import com.kitchenledger.inventory.model.InventoryCountItem;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.Recipe;
import com.kitchenledger.inventory.repository.InventoryCountItemRepository;
import com.kitchenledger.inventory.repository.InventoryCountRepository;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.RecipeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class InternalInventoryControllerCountsIT {

    @Mock private InventoryItemRepository itemRepository;
    @Mock private RecipeRepository recipeRepository;
    @Mock private InventoryCountRepository countRepository;
    @Mock private InventoryCountItemRepository countItemRepository;

    @InjectMocks
    private InternalInventoryController controller;

    private MockMvc mockMvc;

    private static final String SECRET = "test-internal-secret";
    private static final UUID TENANT   = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(controller, "internalSecret", SECRET);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    // ── GET /internal/inventory/counts ────────────────────────────────────────

    @Test
    void getCounts_returnsList() throws Exception {
        InventoryItem item = buildItem("Onion");

        InventoryCount count = InventoryCount.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .countDate(java.time.LocalDate.now())
                .createdAt(Instant.now())
                .build();

        InventoryCountItem ci = InventoryCountItem.builder()
                .id(UUID.randomUUID())
                .inventoryCount(count)
                .inventoryItem(item)
                .expectedQuantity(new BigDecimal("10"))
                .countedQuantity(new BigDecimal("8"))
                .unit("kg")
                .unitCost(new BigDecimal("50"))
                .createdAt(Instant.now())
                .build();

        when(countItemRepository.findByTenantId(TENANT)).thenReturn(List.of(ci));

        mockMvc.perform(get("/internal/inventory/counts")
                        .header("x-internal-secret", SECRET)
                        .param("tenantId", TENANT.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].item_name").value("Onion"))
                .andExpect(jsonPath("$[0].expected_quantity").value(10))
                .andExpect(jsonPath("$[0].counted_quantity").value(8));
    }

    @Test
    void getCounts_wrongSecret_returns403() throws Exception {
        mockMvc.perform(get("/internal/inventory/counts")
                        .header("x-internal-secret", "wrong")
                        .param("tenantId", TENANT.toString()))
                .andExpect(status().isForbidden());
    }

    // ── GET /internal/inventory/recipes ───────────────────────────────────────

    @Test
    void getRecipes_returnsList() throws Exception {
        Recipe recipe = Recipe.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .name("Tomato Soup")
                .menuPrice(new BigDecimal("150"))
                .totalCost(new BigDecimal("60"))
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        when(recipeRepository.findByTenantIdAndDeletedAtIsNull(TENANT)).thenReturn(List.of(recipe));

        mockMvc.perform(get("/internal/inventory/recipes")
                        .header("x-internal-secret", SECRET)
                        .param("tenantId", TENANT.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].name").value("Tomato Soup"));
    }

    @Test
    void getRecipes_wrongSecret_returns403() throws Exception {
        mockMvc.perform(get("/internal/inventory/recipes")
                        .header("x-internal-secret", "bad")
                        .param("tenantId", TENANT.toString()))
                .andExpect(status().isForbidden());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private InventoryItem buildItem(String name) {
        return InventoryItem.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .name(name)
                .unit("kg")
                .unitCost(new BigDecimal("50"))
                .currentStock(new BigDecimal("10"))
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }
}
