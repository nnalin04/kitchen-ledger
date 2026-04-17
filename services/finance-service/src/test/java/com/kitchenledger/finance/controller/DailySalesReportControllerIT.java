package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.AbstractIT;
import com.kitchenledger.finance.dto.request.CreateDsrRequest;
import com.kitchenledger.finance.model.DailySalesReport;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Date;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class DailySalesReportControllerIT extends AbstractIT {

    @Autowired
    private DailySalesReportRepository repository;

    private UUID tenantId;
    private UUID userId;
    private String token;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        userId = UUID.randomUUID();
        token = generateTestToken(userId, tenantId, "manager");
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
                .claim("email", "manager@example.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 5))
                .signWith(com.kitchenledger.finance.util.TestKeyPairFactory.privateKey(), Jwts.SIG.RS256)
                .compact();
    }

    @Test
    void testCreateDsr() throws Exception {
        CreateDsrRequest req = new CreateDsrRequest();
        req.setReportDate(LocalDate.now());
        req.setCoversCount(50);
        req.setGrossSales(new BigDecimal("1000.00"));
        req.setDiscounts(new BigDecimal("50.00"));
        req.setCashSales(new BigDecimal("200.00"));
        req.setUpiSales(new BigDecimal("300.00"));
        req.setCardSales(new BigDecimal("450.00"));
        req.setOtherSales(new BigDecimal("0.00"));
        req.setVatCollected(new BigDecimal("100.00"));
        req.setServiceChargeCollected(new BigDecimal("50.00"));
        req.setCostOfGoodsSold(new BigDecimal("300.00"));

        mockMvc.perform(post("/api/v1/finance/daily-sales-reports")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.gross_sales").value(1000.0))
                .andExpect(jsonPath("$.data.covers_count").value(50));
    }

    @Test
    void testListDsr() throws Exception {
        DailySalesReport dsr = DailySalesReport.builder()
                .tenantId(tenantId)
                .reportDate(LocalDate.now().minusDays(1))
                .grossSales(new BigDecimal("1500.00"))
                .coversCount(80)
                .createdBy(userId)
                .build();
        repository.save(dsr);

        mockMvc.perform(get("/api/v1/finance/daily-sales-reports")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].covers_count").value(80));
    }

    @Test
    void testFinalizeDsr() throws Exception {
        DailySalesReport dsr = DailySalesReport.builder()
                .tenantId(tenantId)
                .reportDate(LocalDate.now())
                .grossSales(new BigDecimal("1500.00"))
                .coversCount(80)
                .createdBy(userId)
                .build();
        dsr = repository.save(dsr);

        mockMvc.perform(post("/api/v1/finance/daily-sales-reports/" + dsr.getId() + "/finalize")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.finalized").value(true));
    }
}
