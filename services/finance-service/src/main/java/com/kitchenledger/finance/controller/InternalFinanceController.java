package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.response.DsrResponse;
import com.kitchenledger.finance.dto.response.ExpenseResponse;
import com.kitchenledger.finance.exception.AccessDeniedException;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import com.kitchenledger.finance.repository.ExpenseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Internal endpoints for report-service and other services.
 * Protected by INTERNAL_SERVICE_SECRET — not exposed publicly.
 */
@RestController
@RequestMapping("/internal/finance")
@RequiredArgsConstructor
public class InternalFinanceController {

    private final DailySalesReportRepository dsrRepository;
    private final ExpenseRepository expenseRepository;

    @Value("${internal.service-secret}")
    private String internalSecret;

    @GetMapping("/dsr")
    public ResponseEntity<List<DsrResponse>> listDsr(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to) {
        verifySecret(secret);
        var page = (from != null && to != null)
                ? dsrRepository.findByTenantIdAndReportDateBetweenOrderByReportDateDesc(
                        tenantId, from, to, PageRequest.of(0, 100))
                : dsrRepository.findByTenantIdOrderByReportDateDesc(
                        tenantId, PageRequest.of(0, 31));
        return ResponseEntity.ok(page.map(DsrResponse::from).getContent());
    }

    @GetMapping("/expenses")
    public ResponseEntity<List<ExpenseResponse>> listExpenses(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId) {
        verifySecret(secret);
        List<ExpenseResponse> items = expenseRepository
                .findByTenantIdAndDeletedAtIsNullOrderByExpenseDateDesc(
                        tenantId, PageRequest.of(0, 500))
                .map(ExpenseResponse::from)
                .getContent();
        return ResponseEntity.ok(items);
    }

    private void verifySecret(String provided) {
        if (provided == null || !MessageDigest.isEqual(
                internalSecret.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8))) {
            throw new AccessDeniedException("Invalid internal service secret");
        }
    }
}
