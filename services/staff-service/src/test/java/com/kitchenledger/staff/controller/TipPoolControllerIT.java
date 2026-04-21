package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.AbstractIT;
import com.kitchenledger.staff.model.TipPool;
import com.kitchenledger.staff.repository.TipPoolRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TipPoolControllerIT extends AbstractIT {

    @Autowired private TipPoolRepository tipPoolRepository;

    private UUID tenantId;
    private UUID userId;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        userId   = UUID.randomUUID();
    }

    @AfterEach
    void tearDown() {
        tipPoolRepository.deleteAll();
    }

    @Test
    void testCreate_returns201() throws Exception {
        Map<String, Object> body = Map.of(
                "poolDate",           LocalDate.now().toString(),
                "totalAmount",        "1250.00",
                "distributionMethod", "hours_worked"
        );

        mockMvc.perform(post("/api/v1/staff/tip-pools")
                .header("x-user-id",   userId.toString())
                .header("x-tenant-id", tenantId.toString())
                .header("x-user-role", "manager")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.totalAmount").value(1250.00))
                .andExpect(jsonPath("$.distributed").value(false));
    }

    @Test
    void testDistribute_returns200_withCorrectAmounts() throws Exception {
        TipPool pool = tipPoolRepository.save(TipPool.builder()
                .tenantId(tenantId)
                .poolDate(LocalDate.now())
                .totalAmount(new BigDecimal("800.00"))
                .distributionMethod("equal")
                .distributed(false)
                .createdBy(userId)
                .build());

        mockMvc.perform(post("/api/v1/staff/tip-pools/" + pool.getId() + "/distribute")
                .header("x-user-id",   userId.toString())
                .header("x-tenant-id", tenantId.toString())
                .header("x-user-role", "manager"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.distributed").value(true))
                .andExpect(jsonPath("$.distributedAt").isString())
                .andExpect(jsonPath("$.totalAmount").value(800.00));
    }
}
