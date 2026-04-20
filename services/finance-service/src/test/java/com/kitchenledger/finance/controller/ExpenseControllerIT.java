package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.AbstractIT;
import com.kitchenledger.finance.model.Expense;
import com.kitchenledger.finance.repository.ExpenseRepository;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ExpenseControllerIT extends AbstractIT {

    @Autowired private ExpenseRepository expenseRepository;

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
        expenseRepository.deleteAll();
    }

    private String generateTestToken(UUID userId, UUID tenantId, String role) {
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenant_id", tenantId.toString())
                .claim("role", role)
                .claim("email", "manager@restaurant.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 5))
                .signWith(com.kitchenledger.finance.util.TestKeyPairFactory.privateKey(), Jwts.SIG.RS256)
                .compact();
    }

    @Test
    void testCreate_validExpense_returns201() throws Exception {
        Map<String, Object> reqBody = Map.of(
                "expenseDate",  LocalDate.now().toString(),
                "category",     "ingredients",
                "description",  "Weekly vegetable purchase",
                "amount",       "2500.00",
                "paymentMethod","cash"
        );

        mockMvc.perform(post("/api/v1/finance/expenses")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(reqBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.amount").value(2500.00));
    }

    @Test
    void testCreate_missingRequiredFields_returns400() throws Exception {
        // Missing "amount" which is required
        Map<String, Object> reqBody = Map.of(
                "expenseDate", LocalDate.now().toString(),
                "category",    "utilities",
                "description", "Electricity bill"
                // amount missing
        );

        mockMvc.perform(post("/api/v1/finance/expenses")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(reqBody)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void testList_paginatesCorrectly() throws Exception {
        mockMvc.perform(get("/api/v1/finance/expenses")
                        .header("Authorization", "Bearer " + token)
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());
    }

    @Test
    void testDelete_softDeletes_notInSubsequentList() throws Exception {
        // Create an expense first
        Expense expense = expenseRepository.save(Expense.builder()
                .tenantId(tenantId)
                .expenseDate(LocalDate.now())
                .category("utilities")
                .description("Gas bill")
                .amount(new BigDecimal("1200.00"))
                .createdBy(userId)
                .build());

        // Delete it
        mockMvc.perform(delete("/api/v1/finance/expenses/" + expense.getId())
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNoContent());

        // Should not appear in list (soft deleted)
        mockMvc.perform(get("/api/v1/finance/expenses")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty());
    }
}
