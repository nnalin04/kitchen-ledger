package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.AbstractIT;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.WasteLogRepository;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class WasteLogControllerIT extends AbstractIT {

    @Autowired private WasteLogRepository wasteLogRepository;
    @Autowired private InventoryItemRepository itemRepository;

    private UUID tenantId;
    private UUID userId;
    private String token;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        userId   = UUID.randomUUID();
        token    = generateTestToken(userId, tenantId, "kitchen_staff");
    }

    @AfterEach
    void tearDown() {
        wasteLogRepository.deleteAll();
        itemRepository.deleteAll();
    }

    private String generateTestToken(UUID userId, UUID tenantId, String role) {
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenant_id", tenantId.toString())
                .claim("role", role)
                .claim("email", "staff@spicegarden.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 5))
                .signWith(com.kitchenledger.inventory.util.TestKeyPairFactory.privateKey(), Jwts.SIG.RS256)
                .compact();
    }

    @Test
    void testLogWaste_validRequest_returnsCreated() throws Exception {
        InventoryItem item = itemRepository.save(InventoryItem.builder()
                .tenantId(tenantId).name("Tomatoes")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(new BigDecimal("20.0"))
                .avgCost(new BigDecimal("40.00"))
                .build());

        Map<String, Object> reqBody = Map.of(
                "inventoryItemId", item.getId().toString(),
                "quantity", "1.5",
                "unit", "kg",
                "reason", "spoilage"
        );

        mockMvc.perform(post("/api/v1/inventory/waste-logs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(reqBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quantity").value(1.5))
                .andExpect(jsonPath("$.reason").value("spoilage"));
    }

    @Test
    void testLogWaste_unknownItem_returns404() throws Exception {
        Map<String, Object> reqBody = Map.of(
                "inventoryItemId", UUID.randomUUID().toString(),
                "quantity", "1.0",
                "unit", "kg",
                "reason", "spoilage"
        );

        mockMvc.perform(post("/api/v1/inventory/waste-logs")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(reqBody)))
                .andExpect(status().isNotFound());
    }

    @Test
    void testListWasteLogs_returnsPaginatedResults() throws Exception {
        mockMvc.perform(get("/api/v1/inventory/waste-logs")
                        .header("Authorization", "Bearer " + token)
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());
    }
}
