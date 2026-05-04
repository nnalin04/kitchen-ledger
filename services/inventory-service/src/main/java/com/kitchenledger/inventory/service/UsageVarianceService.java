package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.UsageVarianceRequest;
import com.kitchenledger.inventory.dto.response.UsageVarianceResponse;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.Recipe;
import com.kitchenledger.inventory.model.RecipeIngredient;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.RecipeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class UsageVarianceService {

    private static final BigDecimal ALERT_THRESHOLD    = new BigDecimal("5");
    private static final BigDecimal CRITICAL_THRESHOLD = new BigDecimal("20");

    private final RecipeRepository recipeRepository;
    private final InventoryItemRepository itemRepository;
    private final JdbcTemplate jdbcTemplate;

    @Transactional
    public UsageVarianceResponse logVariance(UUID tenantId, UUID loggedBy, UsageVarianceRequest req) {
        Recipe recipe = recipeRepository.findByIdAndTenantIdAndDeletedAtIsNull(req.getRecipeId(), tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Recipe not found: " + req.getRecipeId()));

        // Build actual usage map: itemId → actualQuantity
        Map<UUID, BigDecimal> actualMap = req.getActualUsage().stream()
                .collect(Collectors.toMap(
                        UsageVarianceRequest.ActualUsageItem::getItemId,
                        UsageVarianceRequest.ActualUsageItem::getActualQuantity));

        List<UsageVarianceResponse.IngredientVariance> variances = new ArrayList<>();
        String overallStatus = "ACCEPTABLE";

        for (RecipeIngredient ingredient : recipe.getIngredients()) {
            if (ingredient.getInventoryItemId() == null) continue;

            BigDecimal theoretical = ingredient.getQuantity()
                    .multiply(new BigDecimal(req.getPortionsServed()))
                    .setScale(4, RoundingMode.HALF_UP);

            BigDecimal actual = actualMap.getOrDefault(ingredient.getInventoryItemId(), theoretical);
            BigDecimal variance = actual.subtract(theoretical).setScale(4, RoundingMode.HALF_UP);
            BigDecimal variancePct = theoretical.compareTo(BigDecimal.ZERO) == 0
                    ? BigDecimal.ZERO
                    : variance.abs()
                            .multiply(new BigDecimal("100"))
                            .divide(theoretical, 2, RoundingMode.HALF_UP);

            String status;
            if (variancePct.compareTo(CRITICAL_THRESHOLD) > 0) {
                status = "CRITICAL";
                overallStatus = "CRITICAL";
            } else if (variancePct.compareTo(ALERT_THRESHOLD) > 0) {
                status = "ALERT";
                if (!"CRITICAL".equals(overallStatus)) overallStatus = "ALERT";
            } else {
                status = "ACCEPTABLE";
            }

            String itemName = itemRepository.findById(ingredient.getInventoryItemId())
                    .map(i -> i.getName()).orElse("Unknown");

            variances.add(UsageVarianceResponse.IngredientVariance.builder()
                    .itemId(ingredient.getInventoryItemId())
                    .itemName(itemName)
                    .theoreticalQuantity(theoretical)
                    .actualQuantity(actual)
                    .varianceQuantity(variance)
                    .variancePercent(variancePct)
                    .unit(ingredient.getUnit())
                    .status(status)
                    .build());
        }

        // Persist log
        UUID logId = UUID.randomUUID();
        String variancesJson = buildJsonArray(variances);
        jdbcTemplate.update(
                """
                INSERT INTO usage_variance_logs
                  (id, tenant_id, recipe_id, service_date, portions_served,
                   ingredient_variances, overall_status, logged_by)
                VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?)
                """,
                logId, tenantId, req.getRecipeId(), req.getServiceDate(),
                req.getPortionsServed(), variancesJson, overallStatus, loggedBy);

        log.info("AvT logged: recipe={} date={} status={}", recipe.getName(), req.getServiceDate(), overallStatus);

        return UsageVarianceResponse.builder()
                .id(logId)
                .recipeId(recipe.getId())
                .recipeName(recipe.getName())
                .serviceDate(req.getServiceDate())
                .portionsServed(req.getPortionsServed())
                .overallStatus(overallStatus)
                .ingredients(variances)
                .build();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getReport(UUID tenantId, LocalDate dateFrom, LocalDate dateTo, UUID recipeId) {
        if (dateFrom == null) dateFrom = LocalDate.now().minusDays(7);
        if (dateTo == null)   dateTo   = LocalDate.now();

        String sql;
        Object[] params;
        if (recipeId != null) {
            sql = """
                    SELECT id, recipe_id, service_date, portions_served,
                           overall_status, ingredient_variances, logged_by, created_at
                    FROM usage_variance_logs
                    WHERE tenant_id = ? AND service_date BETWEEN ? AND ? AND recipe_id = ?
                    ORDER BY service_date DESC
                    LIMIT 100
                    """;
            params = new Object[]{ tenantId, dateFrom, dateTo, recipeId };
        } else {
            sql = """
                    SELECT id, recipe_id, service_date, portions_served,
                           overall_status, ingredient_variances, logged_by, created_at
                    FROM usage_variance_logs
                    WHERE tenant_id = ? AND service_date BETWEEN ? AND ?
                    ORDER BY service_date DESC
                    LIMIT 100
                    """;
            params = new Object[]{ tenantId, dateFrom, dateTo };
        }
        return jdbcTemplate.queryForList(sql, params);
    }

    private String buildJsonArray(List<UsageVarianceResponse.IngredientVariance> variances) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < variances.size(); i++) {
            UsageVarianceResponse.IngredientVariance v = variances.get(i);
            if (i > 0) sb.append(",");
            sb.append("{")
              .append("\"itemId\":\"").append(v.getItemId()).append("\",")
              .append("\"itemName\":\"").append(v.getItemName().replace("\"", "\\\"")).append("\",")
              .append("\"theoreticalQuantity\":").append(v.getTheoreticalQuantity()).append(",")
              .append("\"actualQuantity\":").append(v.getActualQuantity()).append(",")
              .append("\"varianceQuantity\":").append(v.getVarianceQuantity()).append(",")
              .append("\"variancePercent\":").append(v.getVariancePercent()).append(",")
              .append("\"unit\":\"").append(v.getUnit() != null ? v.getUnit() : "").append("\",")
              .append("\"status\":\"").append(v.getStatus()).append("\"")
              .append("}");
        }
        sb.append("]");
        return sb.toString();
    }
}
