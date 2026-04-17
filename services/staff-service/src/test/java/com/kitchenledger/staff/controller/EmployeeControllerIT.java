package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.AbstractIT;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.repository.EmployeeRepository;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.Date;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class EmployeeControllerIT extends AbstractIT {

    @Autowired
    private EmployeeRepository repository;

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
                .claim("email", "owner@example.com")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 1000 * 60 * 5))
                .signWith(com.kitchenledger.staff.util.TestKeyPairFactory.privateKey(), Jwts.SIG.RS256)
                .compact();
    }

    @Test
    void testListEmployees() throws Exception {
        Employee emp = Employee.builder()
                .tenantId(tenantId)
                .userId(UUID.randomUUID())
                .firstName("John")
                .lastName("Doe")
                .role("server")
                .hireDate(LocalDate.now())
                .active(true)
                .build();
        repository.save(emp);

        mockMvc.perform(get("/api/v1/staff/employees")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].first_name").value("John"));
    }
}
