package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.AbstractIT;
import com.kitchenledger.inventory.model.PurchaseOrder;
import com.kitchenledger.inventory.model.Supplier;
import com.kitchenledger.inventory.model.enums.PurchaseOrderStatus;
import com.kitchenledger.inventory.repository.PurchaseOrderRepository;
import com.kitchenledger.inventory.repository.SupplierRepository;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PurchaseOrderControllerIT extends AbstractIT {

    @Autowired private PurchaseOrderRepository poRepository;
    @Autowired private SupplierRepository supplierRepository;

    private UUID tenantId;
    private UUID userId;
    private String token;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        userId   = UUID.randomUUID();
        token    = generateTestToken(userId, tenantId, "manager");
    }

    @AfterEach
    void tearDown() {
        poRepository.deleteAll();
        supplierRepository.deleteAll();
    }

    private String generateTestToken(UUID userId, UUID tenantId, String role) {
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenant_id", tenantId.toString())
                .claim("role", role)
                .claim("email", "manager@spicegarden.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 5))
                .signWith(com.kitchenledger.inventory.util.TestKeyPairFactory.privateKey(), Jwts.SIG.RS256)
                .compact();
    }

    @Test
    void testCreatePurchaseOrder_returnsCreated() throws Exception {
        Supplier supplier = supplierRepository.save(Supplier.builder()
                .tenantId(tenantId).name("Fresh Farms")
                .build());

        Map<String, Object> reqBody = Map.of(
                "supplierId",    supplier.getId().toString(),
                "expectedDate",  LocalDate.now().plusDays(7).toString(),
                "items", List.of(Map.of(
                        "supplierId",      supplier.getId().toString(),
                        "description",     "Tomatoes",
                        "quantity",        "10",
                        "unit",            "kg",
                        "unitPrice",       "40.00"
                ))
        );

        mockMvc.perform(post("/api/v1/inventory/purchase-orders")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(reqBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.status").value("draft"));
    }

    @Test
    void testListPurchaseOrders_returnsPaginatedResults() throws Exception {
        mockMvc.perform(get("/api/v1/inventory/purchase-orders")
                        .header("Authorization", "Bearer " + token)
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());
    }

    @Test
    void testCancelPurchaseOrder_changeStatusToCancelled() throws Exception {
        Supplier supplier = supplierRepository.save(Supplier.builder()
                .tenantId(tenantId).name("Veggie World")
                .build());

        PurchaseOrder po = poRepository.save(PurchaseOrder.builder()
                .tenantId(tenantId)
                .supplierId(supplier.getId())
                .poNumber("PO-TEST-001")
                .status(PurchaseOrderStatus.draft)
                .totalAmount(BigDecimal.ZERO)
                .createdBy(userId)
                .build());

        mockMvc.perform(post("/api/v1/inventory/purchase-orders/" + po.getId() + "/cancel")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("cancelled"));
    }
}
