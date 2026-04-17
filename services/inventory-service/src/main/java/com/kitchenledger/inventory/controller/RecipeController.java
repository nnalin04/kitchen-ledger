package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.request.CreateRecipeRequest;
import com.kitchenledger.inventory.dto.response.RecipeResponse;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.RecipeService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/recipes")
@RequiredArgsConstructor
public class RecipeController {

    private final RecipeService recipeService;

    @GetMapping
    public ResponseEntity<List<RecipeResponse>> list(HttpServletRequest req) {
        List<RecipeResponse> recipes = recipeService.listByTenant(tenantId(req))
                .stream().map(RecipeResponse::from).toList();
        return ResponseEntity.ok(recipes);
    }

    @GetMapping("/{id}")
    public ResponseEntity<RecipeResponse> getById(HttpServletRequest req,
                                                   @PathVariable UUID id) {
        return ResponseEntity.ok(
                RecipeResponse.from(recipeService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager", "kitchen_staff"})
    public ResponseEntity<RecipeResponse> create(HttpServletRequest req,
                                                  @Valid @RequestBody CreateRecipeRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(RecipeResponse.from(recipeService.create(tenantId(req), body)));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner", "manager", "kitchen_staff"})
    public ResponseEntity<RecipeResponse> update(HttpServletRequest req,
                                                  @PathVariable UUID id,
                                                  @Valid @RequestBody CreateRecipeRequest body) {
        return ResponseEntity.ok(
                RecipeResponse.from(recipeService.update(tenantId(req), id, body)));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        recipeService.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
