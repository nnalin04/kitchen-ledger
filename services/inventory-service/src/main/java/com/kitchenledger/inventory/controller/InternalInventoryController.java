package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.response.InventoryItemResponse;
import com.kitchenledger.inventory.dto.response.RecipeResponse;
import com.kitchenledger.inventory.dto.response.WasteLogResponse;
import com.kitchenledger.inventory.exception.AccessDeniedException;
import com.kitchenledger.inventory.model.InventoryCountItem;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.InventoryMovement;
import com.kitchenledger.inventory.model.WasteLog;
import com.kitchenledger.inventory.repository.InventoryCountItemRepository;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import com.kitchenledger.inventory.repository.RecipeRepository;
import com.kitchenledger.inventory.repository.WasteLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Internal endpoints consumed by other services (report-service, ai-service).
 * Protected by INTERNAL_SERVICE_SECRET header — not exposed publicly via Gateway.
 */
@RestController
@RequestMapping("/internal/inventory")
@RequiredArgsConstructor
public class InternalInventoryController {

    private final InventoryItemRepository itemRepository;
    private final InventoryMovementRepository movementRepository;
    private final WasteLogRepository wasteLogRepository;
    private final RecipeRepository recipeRepository;
    private final InventoryCountItemRepository countItemRepository;
    private final JdbcTemplate jdbcTemplate;

    @Value("${internal.service-secret}")
    private String internalSecret;

    @GetMapping("/items")
    public ResponseEntity<List<InventoryItemResponse>> listItems(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId) {
        verifySecret(secret);
        List<InventoryItemResponse> items = itemRepository
                .findByTenantIdAndDeletedAtIsNull(tenantId)
                .stream().map(InventoryItemResponse::from).toList();
        return ResponseEntity.ok(items);
    }

    @GetMapping("/items/{id}")
    public ResponseEntity<InventoryItemResponse> getItem(
            @RequestHeader("x-internal-secret") String secret,
            @PathVariable UUID id,
            @RequestParam UUID tenantId) {
        verifySecret(secret);
        return itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .map(InventoryItemResponse::from)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/items/below-par")
    public ResponseEntity<List<InventoryItemResponse>> belowPar(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId) {
        verifySecret(secret);
        List<InventoryItemResponse> items = itemRepository
                .findBelowParLevel(tenantId)
                .stream().map(InventoryItemResponse::from).toList();
        return ResponseEntity.ok(items);
    }

    @GetMapping("/waste")
    public ResponseEntity<List<WasteLogResponse>> listWaste(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        verifySecret(secret);

        Instant fromInstant = from != null ? from.atStartOfDay(ZoneOffset.UTC).toInstant() : Instant.EPOCH;
        Instant toInstant   = to   != null ? to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant() : Instant.now();

        List<WasteLog> logs = wasteLogRepository
                .findByTenantIdAndLoggedAtBetweenOrderByLoggedAtDesc(tenantId, fromInstant, toInstant);

        // Resolve item names in one query to avoid N+1
        List<UUID> itemIds = logs.stream().map(WasteLog::getInventoryItemId).distinct().toList();
        Map<UUID, String> nameById = itemRepository.findAllById(itemIds)
                .stream()
                .collect(Collectors.toMap(InventoryItem::getId, InventoryItem::getName));

        List<WasteLogResponse> response = logs.stream()
                .map(w -> {
                    WasteLogResponse r = WasteLogResponse.from(w);
                    r.setItemName(nameById.getOrDefault(w.getInventoryItemId(), null));
                    return r;
                })
                .toList();

        // Return as a list; callers can use inventoryItemId to correlate with item names
        return ResponseEntity.ok(response);
    }

    /**
     * Returns all stock count items for a tenant — consumed by report-service
     * to generate inventory-variance, food-cost, and waste reports.
     */
    @GetMapping("/counts")
    public ResponseEntity<List<Map<String, Object>>> listCounts(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId) {
        verifySecret(secret);

        List<InventoryCountItem> items = countItemRepository.findByTenantId(tenantId);
        List<Map<String, Object>> response = items.stream().map(ci -> {
            BigDecimal variance = ci.getCountedQuantity() != null
                    ? ci.getCountedQuantity().subtract(ci.getExpectedQuantity())
                    : null;
            return Map.<String, Object>of(
                    "item_id",           ci.getInventoryItem().getId().toString(),
                    "item_name",         ci.getInventoryItem().getName(),
                    "expected_quantity", ci.getExpectedQuantity(),
                    "counted_quantity",  ci.getCountedQuantity() != null ? ci.getCountedQuantity() : BigDecimal.ZERO,
                    "unit",              ci.getUnit(),
                    "unit_cost",         ci.getUnitCost(),
                    "variance_quantity", variance != null ? variance : BigDecimal.ZERO,
                    "variance_cost",     ci.getVarianceCost() != null ? ci.getVarianceCost() : BigDecimal.ZERO,
                    "count_date",        ci.getInventoryCount().getCountDate() != null
                                         ? ci.getInventoryCount().getCountDate().toString() : ""
            );
        }).toList();

        return ResponseEntity.ok(response);
    }

    /**
     * Returns all active recipes for a tenant — consumed by report-service
     * for food-cost-by-category and menu-engineering reports.
     */
    @GetMapping("/recipes")
    public ResponseEntity<List<RecipeResponse>> listRecipes(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId) {
        verifySecret(secret);
        List<RecipeResponse> recipes = recipeRepository
                .findByTenantIdAndDeletedAtIsNull(tenantId)
                .stream()
                .map(RecipeResponse::from)
                .toList();
        return ResponseEntity.ok(recipes);
    }

    /**
     * Returns audit log entries for a tenant and date range — consumed by
     * report-service audit-log report.
     */
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
                ORDER BY changed_at DESC
                LIMIT 500
                """;

        String userIdStr    = userId    != null ? userId.toString()    : null;
        String eventTypeStr = eventType != null ? eventType            : null;

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                sql, tenantId, fromInstant, toInstant,
                userIdStr, userIdStr, eventTypeStr, eventTypeStr
        );
        return ResponseEntity.ok(rows);
    }

    /**
     * Batch lookup by name array — for AI Service OCR catalog matching.
     * Names are matched case-insensitively.
     */
    @GetMapping("/items/by-names")
    public ResponseEntity<List<InventoryItemResponse>> getByNames(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId,
            @RequestParam(name = "names") List<String> names) {
        verifySecret(secret);
        List<String> lowerNames = names.stream()
                .map(String::toLowerCase)
                .toList();
        List<InventoryItemResponse> items = itemRepository
                .findByTenantIdAndNameInIgnoreCaseAndDeletedAtIsNull(tenantId, lowerNames)
                .stream().map(InventoryItemResponse::from).toList();
        return ResponseEntity.ok(items);
    }

    /**
     * Movement history for an item — consumed by AI Service for demand forecasting.
     * Returns movements for the last {@code days} days (default 56 = 8 weeks).
     */
    @GetMapping("/items/{id}/movements")
    public ResponseEntity<List<Map<String, Object>>> getItemMovements(
            @RequestHeader("x-internal-secret") String secret,
            @PathVariable UUID id,
            @RequestParam UUID tenantId,
            @RequestParam(defaultValue = "56") int days) {
        verifySecret(secret);
        Instant since = Instant.now().minusSeconds((long) days * 86400);
        List<Map<String, Object>> movements = movementRepository
                .findByTenantIdAndInventoryItemIdAndCreatedAtAfterOrderByCreatedAtDesc(tenantId, id, since)
                .stream()
                .map(m -> Map.<String, Object>of(
                        "id",             m.getId(),
                        "movement_type",  m.getMovementType().name(),
                        "quantity_delta", m.getQuantityDelta(),
                        "unit",           m.getUnit() != null ? m.getUnit() : "",
                        "unit_cost",      m.getUnitCost() != null ? m.getUnitCost() : BigDecimal.ZERO,
                        "reference_type", m.getReferenceType() != null ? m.getReferenceType() : "",
                        "created_at",     m.getCreatedAt() != null ? m.getCreatedAt().toString() : ""
                ))
                .toList();
        return ResponseEntity.ok(movements);
    }

    /**
     * Cost endpoint for Finance Service — returns avg_cost and count_unit for a single item.
     */
    @GetMapping("/items/{id}/cost")
    public ResponseEntity<Map<String, Object>> getItemCost(
            @RequestHeader("x-internal-secret") String secret,
            @PathVariable UUID id,
            @RequestParam UUID tenantId) {
        verifySecret(secret);
        return itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .map(item -> ResponseEntity.ok(Map.<String, Object>of(
                        "id",         item.getId(),
                        "name",       item.getName(),
                        "avg_cost",   item.getAvgCost() != null ? item.getAvgCost() : BigDecimal.ZERO,
                        "count_unit", item.getCountUnit() != null ? item.getCountUnit() : ""
                )))
                .orElse(ResponseEntity.notFound().build());
    }

    private void verifySecret(String provided) {
        if (provided == null || !MessageDigest.isEqual(
                internalSecret.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8))) {
            throw new AccessDeniedException("Invalid internal service secret");
        }
    }
}
