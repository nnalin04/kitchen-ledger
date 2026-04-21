package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.AbstractIT;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.Shift;
import com.kitchenledger.staff.model.enums.ShiftStatus;
import com.kitchenledger.staff.repository.EmployeeRepository;
import com.kitchenledger.staff.repository.ShiftRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for ShiftController.
 * Uses gateway-trust headers (x-user-id, x-tenant-id, x-user-role) directly,
 * as the staff-service is downstream of the API gateway in production.
 */
class ShiftControllerIT extends AbstractIT {

    @Autowired private ShiftRepository shiftRepository;
    @Autowired private EmployeeRepository employeeRepository;

    private UUID tenantId;
    private UUID managerId;
    private UUID employeeUserId;

    @BeforeEach
    void setUp() {
        tenantId       = UUID.randomUUID();
        managerId      = UUID.randomUUID();
        employeeUserId = UUID.randomUUID();
    }

    @AfterEach
    void tearDown() {
        shiftRepository.deleteAll();
        employeeRepository.deleteAll();
    }

    /** Performs a request with gateway-trust headers set (manager role by default). */
    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
            withManager(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req) {
        return req
                .header("x-user-id",   managerId.toString())
                .header("x-tenant-id", tenantId.toString())
                .header("x-user-role", "manager");
    }

    @Test
    void testCreate_returns201() throws Exception {
        UUID empId = UUID.randomUUID();
        Map<String, Object> body = Map.of(
                "employeeId", empId.toString(),
                "shiftDate",  LocalDate.now().plusDays(1).toString(),
                "startTime",  "09:00",
                "endTime",    "17:00",
                "roleLabel",  "server"
        );

        mockMvc.perform(withManager(post("/api/v1/staff/shifts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.status").value("scheduled"));
    }

    @Test
    void testCreate_clopenShift_returns422() throws Exception {
        // End time (07:00) before start time (23:00) — clopen shift is invalid
        UUID empId = UUID.randomUUID();
        Map<String, Object> body = Map.of(
                "employeeId", empId.toString(),
                "shiftDate",  LocalDate.now().plusDays(1).toString(),
                "startTime",  "23:00",
                "endTime",    "07:00"
        );

        mockMvc.perform(withManager(post("/api/v1/staff/shifts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(body))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void testPublish_returns200() throws Exception {
        // Create a scheduled shift first
        UUID empId = UUID.randomUUID();
        LocalDate shiftDate = LocalDate.now().plusWeeks(2);
        shiftRepository.save(Shift.builder()
                .tenantId(tenantId)
                .employeeId(empId)
                .shiftDate(shiftDate)
                .startTime(LocalTime.of(9, 0))
                .endTime(LocalTime.of(17, 0))
                .status(ShiftStatus.scheduled)
                .createdBy(managerId)
                .build());

        mockMvc.perform(withManager(post("/api/v1/staff/shifts/publish")
                .param("from", shiftDate.toString())
                .param("to",   shiftDate.toString())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(1));
    }

    @Test
    void testEmployeeCanViewOwnShifts_returns200() throws Exception {
        // Create the employee record so the RBAC lookup succeeds
        Employee emp = employeeRepository.save(Employee.builder()
                .tenantId(tenantId)
                .userId(employeeUserId)
                .firstName("Sam")
                .lastName("Cook")
                .role("server")
                .hireDate(LocalDate.now())
                .active(true)
                .build());

        // Create a shift for this employee
        shiftRepository.save(Shift.builder()
                .tenantId(tenantId)
                .employeeId(emp.getId())
                .shiftDate(LocalDate.now())
                .startTime(LocalTime.of(9, 0))
                .endTime(LocalTime.of(17, 0))
                .status(ShiftStatus.published)
                .createdBy(managerId)
                .build());

        mockMvc.perform(get("/api/v1/staff/shifts")
                .header("x-user-id",   employeeUserId.toString())
                .header("x-tenant-id", tenantId.toString())
                .header("x-user-role", "employee")
                .param("employeeId", emp.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].employeeId").value(emp.getId().toString()));
    }

    @Test
    void testEmployeeCannotViewOtherEmployeeShifts_returns403() throws Exception {
        // Register the requesting user as an employee
        Employee self = employeeRepository.save(Employee.builder()
                .tenantId(tenantId)
                .userId(employeeUserId)
                .firstName("Self")
                .lastName("Employee")
                .role("server")
                .hireDate(LocalDate.now())
                .active(true)
                .build());

        // A different employee they should NOT be able to filter by
        UUID otherEmployeeId = UUID.randomUUID();

        mockMvc.perform(get("/api/v1/staff/shifts")
                .header("x-user-id",   employeeUserId.toString())
                .header("x-tenant-id", tenantId.toString())
                .header("x-user-role", "employee")
                .param("employeeId", otherEmployeeId.toString()))
                .andExpect(status().isForbidden());
    }
}
