package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.request.CreateExpenseRequest;
import com.kitchenledger.finance.dto.response.ExpenseResponse;
import com.kitchenledger.finance.security.GatewayTrustFilter;
import com.kitchenledger.finance.security.RequiresRole;
import com.kitchenledger.finance.service.ExpenseService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/finance/expenses")
@RequiredArgsConstructor
public class ExpenseController {

    private final ExpenseService expenseService;

    @GetMapping
    public ResponseEntity<Page<ExpenseResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 50) Pageable pageable) {
        return ResponseEntity.ok(
                expenseService.list(tenantId(req), category, from, to, pageable)
                        .map(ExpenseResponse::from));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ExpenseResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(ExpenseResponse.from(expenseService.getById(tenantId(req), id)));
    }

    @GetMapping("/summary")
    public ResponseEntity<Map<String, BigDecimal>> summary(
            HttpServletRequest req,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String category) {
        UUID tenantId = tenantId(req);
        BigDecimal total = category != null
                ? expenseService.totalByCategory(tenantId, category, from, to)
                : expenseService.totalAmount(tenantId, from, to);
        return ResponseEntity.ok(Map.of("total_expenses", total));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<ExpenseResponse> create(HttpServletRequest req,
                                                   @Valid @RequestBody CreateExpenseRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ExpenseResponse.from(expenseService.create(tenantId(req), userId(req), body)));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<ExpenseResponse> update(HttpServletRequest req,
                                                   @PathVariable UUID id,
                                                   @Valid @RequestBody CreateExpenseRequest body) {
        return ResponseEntity.ok(ExpenseResponse.from(expenseService.update(tenantId(req), id, body)));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        expenseService.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
