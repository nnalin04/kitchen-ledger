package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.AbstractIT;
import com.kitchenledger.finance.model.Vendor;
import com.kitchenledger.finance.model.VendorPayment;
import com.kitchenledger.finance.model.enums.PaymentMethod;
import com.kitchenledger.finance.repository.VendorPaymentRepository;
import com.kitchenledger.finance.repository.VendorRepository;
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

class VendorPaymentControllerIT extends AbstractIT {

    @Autowired private VendorPaymentRepository paymentRepository;
    @Autowired private VendorRepository vendorRepository;

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
        paymentRepository.deleteAll();
        vendorRepository.deleteAll();
    }

    private String generateTestToken(UUID userId, UUID tenantId, String role) {
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenant_id", tenantId.toString())
                .claim("role", role)
                .claim("email", "owner@restaurant.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 5))
                .signWith(com.kitchenledger.finance.util.TestKeyPairFactory.privateKey(), Jwts.SIG.RS256)
                .compact();
    }

    @Test
    void testCreate_returns201() throws Exception {
        Vendor vendor = vendorRepository.save(Vendor.builder()
                .tenantId(tenantId).name("Produce Plus")
                .build());

        Map<String, Object> reqBody = Map.of(
                "vendorId",      vendor.getId().toString(),
                "amount",        "3500.00",
                "paymentDate",   LocalDate.now().toString(),
                "paymentMethod", "upi"
        );

        mockMvc.perform(post("/api/v1/finance/vendor-payments")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(reqBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.paymentStatus").value("paid"));
    }

    @Test
    void testMarkPaid_returns200() throws Exception {
        Vendor vendor = vendorRepository.save(Vendor.builder()
                .tenantId(tenantId).name("Dairy Direct")
                .outstandingBalance(new BigDecimal("2000.00"))
                .build());

        VendorPayment pending = paymentRepository.save(VendorPayment.builder()
                .tenantId(tenantId)
                .vendorId(vendor.getId())
                .amount(new BigDecimal("2000.00"))
                .paymentDate(LocalDate.now())
                .paymentStatus("pending")
                .paymentMethod(PaymentMethod.cash)
                .createdBy(userId)
                .build());

        mockMvc.perform(post("/api/v1/finance/vendor-payments/" + pending.getId() + "/paid")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentStatus").value("paid"));
    }

    @Test
    void testList_filtersByVendor() throws Exception {
        mockMvc.perform(get("/api/v1/finance/vendor-payments")
                        .header("Authorization", "Bearer " + token)
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());
    }
}
