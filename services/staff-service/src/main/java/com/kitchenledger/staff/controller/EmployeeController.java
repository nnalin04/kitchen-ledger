package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.CreateEmployeeRequest;
import com.kitchenledger.staff.dto.response.EmployeeResponse;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.EmployeeService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@RestController
@RequestMapping("/api/v1/staff/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeService employeeService;

    @GetMapping
    public ResponseEntity<Page<EmployeeResponse>> list(
            HttpServletRequest req,
            @RequestParam(defaultValue = "false") boolean activeOnly,
            @RequestParam(defaultValue = "0")     int page,
            @RequestParam(defaultValue = "20")    int size,
            @RequestParam(defaultValue = "lastName") String sortBy,
            @RequestParam(defaultValue = "asc")   String sortDir) {
        var pageable = PageRequest.of(page, Math.min(size, 100),
                Sort.by(Sort.Direction.fromString(sortDir), sortBy));
        return ResponseEntity.ok(
                employeeService.listByTenant(tenantId(req), activeOnly, pageable)
                        .map(EmployeeResponse::from));
    }

    @GetMapping("/{id}")
    public ResponseEntity<EmployeeResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(EmployeeResponse.from(employeeService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<EmployeeResponse> create(HttpServletRequest req,
                                                    @Valid @RequestBody CreateEmployeeRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(EmployeeResponse.from(employeeService.create(tenantId(req), body)));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<EmployeeResponse> update(HttpServletRequest req,
                                                    @PathVariable UUID id,
                                                    @Valid @RequestBody CreateEmployeeRequest body) {
        return ResponseEntity.ok(EmployeeResponse.from(employeeService.update(tenantId(req), id, body)));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> terminate(HttpServletRequest req, @PathVariable UUID id) {
        employeeService.terminate(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
