package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.SubmitShiftFeedbackRequest;
import com.kitchenledger.staff.dto.response.ShiftFeedbackResponse;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.ShiftFeedbackService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ShiftFeedbackController {

    private final ShiftFeedbackService feedbackService;

    /** POST /api/v1/staff/shifts/{shiftId}/feedback */
    @PostMapping("/api/v1/staff/shifts/{shiftId}/feedback")
    @RequiresRole({"kitchen_staff", "server", "manager", "owner"})
    public ResponseEntity<ShiftFeedbackResponse> submit(
            HttpServletRequest req,
            @PathVariable UUID shiftId,
            @Valid @RequestBody SubmitShiftFeedbackRequest body) {
        UUID employeeId = userId(req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ShiftFeedbackResponse.from(
                        feedbackService.submitFeedback(tenantId(req), shiftId, employeeId, body)));
    }

    /** GET /api/v1/staff/shifts/{shiftId}/feedback */
    @GetMapping("/api/v1/staff/shifts/{shiftId}/feedback")
    @RequiresRole({"manager", "owner"})
    public ResponseEntity<List<ShiftFeedbackResponse>> listForShift(
            HttpServletRequest req,
            @PathVariable UUID shiftId) {
        List<ShiftFeedbackResponse> responses = feedbackService
                .getFeedbackForShift(tenantId(req), shiftId)
                .stream()
                .map(ShiftFeedbackResponse::from)
                .toList();
        return ResponseEntity.ok(responses);
    }

    /** GET /api/v1/staff/feedback/summary?weeks=4 */
    @GetMapping("/api/v1/staff/feedback/summary")
    @RequiresRole({"manager", "owner"})
    public ResponseEntity<Map<String, Object>> summary(
            HttpServletRequest req,
            @RequestParam(defaultValue = "4") int weeks) {
        return ResponseEntity.ok(feedbackService.getFeedbackSummary(tenantId(req), weeks));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
