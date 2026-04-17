package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.AbstractIT;
import com.kitchenledger.inventory.dto.request.CreateInventoryItemRequest;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.util.Date;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InventoryItemControllerIT extends AbstractIT {

    @Autowired
    private InventoryItemRepository repository;

    private UUID tenantId;
    private UUID userId;
    private String token;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
        token = generateTestToken(userId, tenantId, "owner");
    }

    @AfterEach
    void tearDown() {
        repository.deleteAll();
    }

    private String generateTestToken(UUID userId, UUID tenantId, String role) {
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenant_id", tenantId.toString())
                .claim("role", role)
                .claim("email", "test@example.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 5))
                .signWith(com.kitchenledger.inventory.util.TestKeyPairFactory.privateKey(), Jwts.SIG.RS256)
                .compact();
    }

    @Test
    void testCreateInventoryItem() throws Exception {
        CreateInventoryItemRequest req = new CreateInventoryItemRequest();
        req.setName("Test Tomatoes");
        req.setSku("ITEM-001");
        req.setPurchaseUnit("kg");
        req.setRecipeUnit("kg");
        req.setCountUnit("kg");

        mockMvc.perform(post("/api/v1/inventory/items")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sku").value("ITEM-001"))
                .andExpect(jsonPath("$.data.name").value("Test Tomatoes"));
    }

    @Test
    void testListInventoryItems() throws Exception {
        InventoryItem item = InventoryItem.builder()
                .tenantId(tenantId)
                .name("Onions")
                .purchaseUnit("kg")
                .recipeUnit("kg")
                .countUnit("kg")
                .currentStock(BigDecimal.ZERO)
                .build();
        repository.save(item);

        mockMvc.perform(get("/api/v1/inventory/items")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].name").value("Onions"));
    }
}
