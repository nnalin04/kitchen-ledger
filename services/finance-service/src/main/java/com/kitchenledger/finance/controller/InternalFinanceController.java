package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.response.DsrResponse;
import com.kitchenledger.finance.dto.response.ExpenseResponse;
import com.kitchenledger.finance.exception.AccessDeniedException;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import com.kitchenledger.finance.repository.ExpenseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
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
    private final JdbcTemplate jdbcTemplate;

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
            @RequestParam UUID tenantId,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to) {
        verifySecret(secret);
        // Default: current calendar month when no dates supplied
        LocalDate startDate = from != null ? from : LocalDate.now().withDayOfMonth(1);
        LocalDate endDate   = to   != null ? to   : LocalDate.now();
        List<ExpenseResponse> items = expenseRepository
                .findByTenantIdAndExpenseDateBetweenAndDeletedAtIsNullOrderByExpenseDateDesc(
                        tenantId, startDate, endDate, PageRequest.of(0, 500))
                .map(ExpenseResponse::from)
                .getContent();
        return ResponseEntity.ok(items);
    }

    @GetMapping("/audit/logs")
    public ResponseEntity<List<Map<String, Object>>> auditLogs(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) String eventType) {
        verifySecret(secret);
        Instant fromInstant = from != null ? from.atStartOfDay(ZoneOffset.UTC).toInstant() : Instant.EPOCH;
        Instant toInstant   = to   != null ? to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant() : Instant.now();
        String sql = """
                SELECT id, tenant_id, user_id, event_type, table_name, record_id,
                       old_data, new_data, changed_at
                FROM audit_logs
                WHERE tenant_id = ?
                  AND changed_at >= ? AND changed_at < ?
                  AND (? IS NULL OR user_id = ?::UUID)
                  AND (? IS NULL OR event_type = ?)
                ORDER BY changed_at DESC LIMIT 500
                """;
        String userIdStr = userId != null ? userId.toString() : null;
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                sql, tenantId, fromInstant, toInstant,
                userIdStr, userIdStr, eventType, eventType);
        return ResponseEntity.ok(rows);
    }

    private void verifySecret(String provided) {
        if (provided == null || !MessageDigest.isEqual(
                internalSecret.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8))) {
            throw new AccessDeniedException("Invalid internal service secret");
        }
    }
}
