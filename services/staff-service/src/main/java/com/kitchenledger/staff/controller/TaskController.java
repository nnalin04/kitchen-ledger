package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.CompleteTaskRequest;
import com.kitchenledger.staff.dto.request.CreateTaskRequest;
import com.kitchenledger.staff.dto.response.TaskResponse;
import com.kitchenledger.staff.model.enums.TaskStatus;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.TaskService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/staff/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;

    @GetMapping
    public ResponseEntity<Page<TaskResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) TaskStatus status,
            @PageableDefault(size = 50) Pageable pageable) {
        return ResponseEntity.ok(
                taskService.list(tenantId(req), status, pageable)
                        .map(TaskResponse::from));
    }

    @GetMapping("/employee/{employeeId}")
    public ResponseEntity<List<TaskResponse>> listForEmployee(
            HttpServletRequest req,
            @PathVariable UUID employeeId,
            @RequestParam(required = false) TaskStatus status) {
        return ResponseEntity.ok(
                taskService.listForEmployee(tenantId(req), employeeId, status)
                        .stream().map(TaskResponse::from).toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<TaskResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(TaskResponse.from(taskService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager", "kitchen_staff"})
    public ResponseEntity<TaskResponse> create(HttpServletRequest req,
                                                @Valid @RequestBody CreateTaskRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(TaskResponse.from(taskService.create(tenantId(req), userId(req), body)));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner", "manager", "kitchen_staff"})
    public ResponseEntity<TaskResponse> update(HttpServletRequest req,
                                                @PathVariable UUID id,
                                                @Valid @RequestBody CreateTaskRequest body) {
        return ResponseEntity.ok(TaskResponse.from(taskService.update(tenantId(req), id, body)));
    }

    @PostMapping("/{id}/complete")
    @RequiresRole({"owner", "manager", "kitchen_staff", "server"})
    public ResponseEntity<Void> complete(HttpServletRequest req,
                                          @PathVariable UUID id,
                                          @Valid @RequestBody CompleteTaskRequest body) {
        taskService.complete(tenantId(req), id, body);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/status")
    @RequiresRole({"owner", "manager", "kitchen_staff"})
    public ResponseEntity<TaskResponse> updateStatus(HttpServletRequest req,
                                                      @PathVariable UUID id,
                                                      @RequestBody Map<String, String> body) {
        TaskStatus status = TaskStatus.valueOf(body.get("status"));
        return ResponseEntity.ok(TaskResponse.from(taskService.updateStatus(tenantId(req), id, status)));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        taskService.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
