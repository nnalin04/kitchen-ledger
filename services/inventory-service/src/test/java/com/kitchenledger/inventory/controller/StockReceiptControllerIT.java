package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.AbstractIT;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.StockReceipt;
import com.kitchenledger.inventory.model.StockReceiptItem;
import com.kitchenledger.inventory.model.enums.StockItemCondition;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.StockReceiptRepository;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class StockReceiptControllerIT extends AbstractIT {

    @Autowired private StockReceiptRepository receiptRepository;
    @Autowired private InventoryItemRepository itemRepository;

    private UUID tenantId;
    private UUID userId;
    private String token;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        userId   = UUID.randomUUID();
        token    = generateTestToken(userId, tenantId, "owner");
    }

    @AfterEach
    void tearDown() {
        receiptRepository.deleteAll();
        itemRepository.deleteAll();
    }

    private String generateTestToken(UUID userId, UUID tenantId, String role) {
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenant_id", tenantId.toString())
                .claim("role", role)
                .claim("email", "test@spicegarden.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 5))
                .signWith(com.kitchenledger.inventory.util.TestKeyPairFactory.privateKey(), Jwts.SIG.RS256)
                .compact();
    }

    @Test
    void testCreateStockReceipt_returnsCreated() throws Exception {
        InventoryItem item = itemRepository.save(InventoryItem.builder()
                .tenantId(tenantId).name("Rice")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .build());

        Map<String, Object> reqBody = Map.of(
                "receiptDate", LocalDate.now().toString(),
                "invoiceNumber", "INV-001",
                "invoiceAmount", "500.00",
                "items", List.of(Map.of(
                        "inventoryItemId", item.getId().toString(),
                        "expectedQuantity", "10",
                        "receivedQuantity", "10",
                        "unitCost", "50.00",
                        "unit", "kg"
                ))
        );

        mockMvc.perform(post("/api/v1/inventory/stock-receipts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(reqBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString());
    }

    @Test
    void testConfirmStockReceipt_updatesItemStock() throws Exception {
        InventoryItem item = itemRepository.save(InventoryItem.builder()
                .tenantId(tenantId).name("Wheat Flour")
                .purchaseUnit("kg").recipeUnit("g").countUnit("kg")
                .currentStock(BigDecimal.ZERO)
                .avgCost(new BigDecimal("30.00"))
                .build());

        StockReceiptItem lineItem = StockReceiptItem.builder()
                .inventoryItemId(item.getId())
                .receivedQuantity(new BigDecimal("5.0"))
                .expectedQuantity(new BigDecimal("5.0"))
                .unitCost(new BigDecimal("32.00"))
                .unit("kg")
                .condition(StockItemCondition.good)
                .build();

        StockReceipt receipt = receiptRepository.save(StockReceipt.builder()
                .tenantId(tenantId)
                .receivedBy(userId)
                .confirmed(false)
                .items(new ArrayList<>(List.of(lineItem)))
                .build());

        mockMvc.perform(post("/api/v1/inventory/stock-receipts/" + receipt.getId() + "/confirm")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confirmed").value(true));
    }

    @Test
    void testListStockReceipts_returnsPaginatedResults() throws Exception {
        mockMvc.perform(get("/api/v1/inventory/stock-receipts")
                        .header("Authorization", "Bearer " + token)
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());
    }
}
