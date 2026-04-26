package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.AbstractIT;
import com.kitchenledger.finance.model.DailySalesReport;
import com.kitchenledger.finance.model.Expense;
import com.kitchenledger.finance.model.Vendor;
import com.kitchenledger.finance.model.VendorPayment;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import com.kitchenledger.finance.repository.ExpenseRepository;
import com.kitchenledger.finance.repository.VendorPaymentRepository;
import com.kitchenledger.finance.repository.VendorRepository;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Date;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for {@link ReportController} and {@link ApController}.
 * Uses real PostgreSQL via Testcontainers (inheriting from AbstractIT).
 */
class ReportControllerIT extends AbstractIT {

    @Autowired private DailySalesReportRepository dsrRepository;
    @Autowired private ExpenseRepository expenseRepository;
    @Autowired private VendorRepository vendorRepository;
    @Autowired private VendorPaymentRepository vendorPaymentRepository;

    private UUID tenantId;
    private UUID userId;
    private String ownerToken;

    @BeforeEach
    void setUp() {
        tenantId   = UUID.randomUUID();
        userId     = UUID.randomUUID();
        ownerToken = generateToken(userId, tenantId, "owner");
    }

    @AfterEach
    void tearDown() {
        vendorPaymentRepository.deleteAll();
        expenseRepository.deleteAll();
        dsrRepository.deleteAll();
        vendorRepository.deleteAll();
    }

    // ── P&L report ────────────────────────────────────────────────────────────

    @Test
    void plReport_withRealData_returns200AndValidResponse() throws Exception {
        LocalDate start = LocalDate.now().minusDays(6);
        LocalDate end   = LocalDate.now();

        // Seed 7 DSRs with net_sales = 10,000 each
        for (int i = 0; i < 7; i++) {
            dsrRepository.save(DailySalesReport.builder()
                    .tenantId(tenantId)
                    .reportDate(start.plusDays(i))
                    .grossSales(new BigDecimal("11000.00"))
                    .discounts(new BigDecimal("1000.00"))
                    // net_sales is generated column: grossSales - discounts = 10000
                    .coversCount(50)
                    .createdBy(userId)
                    .build());
        }

        // Seed COGS expenses: 3,000/day × 7 = 21,000
        for (int i = 0; i < 7; i++) {
            expenseRepository.save(Expense.builder()
                    .tenantId(tenantId)
                    .expenseDate(start.plusDays(i))
                    .category("food")
                    .description("Daily food purchase")
                    .amount(new BigDecimal("3000.00"))
                    .createdBy(userId)
                    .build());
        }

        mockMvc.perform(get("/api/v1/finance/reports/pl")
                        .header("Authorization", "Bearer " + ownerToken)
                        .param("start", start.toString())
                        .param("end", end.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.periodStart").value(start.toString()))
                .andExpect(jsonPath("$.data.periodEnd").value(end.toString()))
                .andExpect(jsonPath("$.data.totalCogs").isNumber())
                .andExpect(jsonPath("$.data.foodCostStatus").isString())
                .andExpect(jsonPath("$.data.netProfitStatus").isString());
    }

    @Test
    void plReport_managerRole_returns403() throws Exception {
        String managerToken = generateToken(userId, tenantId, "manager");

        mockMvc.perform(get("/api/v1/finance/reports/pl")
                        .header("Authorization", "Bearer " + managerToken)
                        .param("start", LocalDate.now().minusDays(7).toString())
                        .param("end", LocalDate.now().toString()))
                .andExpect(status().isForbidden());
    }

    @Test
    void plReport_missingStartParam_returns400() throws Exception {
        mockMvc.perform(get("/api/v1/finance/reports/pl")
                        .header("Authorization", "Bearer " + ownerToken)
                        .param("end", LocalDate.now().toString()))
                .andExpect(status().isBadRequest());
    }

    // ── AP summary ────────────────────────────────────────────────────────────

    @Test
    void apSummary_withPendingPayments_returns200() throws Exception {
        Vendor vendor = vendorRepository.save(Vendor.builder()
                .tenantId(tenantId)
                .name("Test Supplier")
                .paymentTermsDays(30)
                .build());

        vendorPaymentRepository.save(VendorPayment.builder()
                .tenantId(tenantId)
                .vendorId(vendor.getId())
                .amount(new BigDecimal("5000.00"))
                .paymentDate(LocalDate.now().minusDays(10))
                .dueDate(LocalDate.now().plusDays(20))
                .paymentStatus("pending")
                .createdBy(userId)
                .build());

        mockMvc.perform(get("/api/v1/finance/ap/summary")
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.totalOutstanding").isNumber())
                .andExpect(jsonPath("$.data.vendors").isArray());
    }

    @Test
    void apSummary_noUnpaidPayments_returnsZeroTotals() throws Exception {
        mockMvc.perform(get("/api/v1/finance/ap/summary")
                        .header("Authorization", "Bearer " + ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalOutstanding").value(0));
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private String generateToken(UUID userId, UUID tenantId, String role) {
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenant_id", tenantId.toString())
                .claim("role", role)
                .claim("email", role + "@restaurant.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 5))
                .signWith(com.kitchenledger.finance.util.TestKeyPairFactory.privateKey(), Jwts.SIG.RS256)
                .compact();
    }
}
