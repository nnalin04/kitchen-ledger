package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.SubmitShiftFeedbackRequest;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.ShiftFeedback;
import com.kitchenledger.staff.repository.ShiftFeedbackRepository;
import com.kitchenledger.staff.repository.ShiftRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ShiftFeedbackService {

    private final ShiftFeedbackRepository feedbackRepository;
    private final ShiftRepository shiftRepository;

    @Transactional
    public ShiftFeedback submitFeedback(UUID tenantId, UUID shiftId, UUID employeeId,
                                        SubmitShiftFeedbackRequest req) {
        // Duplicate check
        if (feedbackRepository.findByShiftIdAndEmployeeId(shiftId, employeeId).isPresent()) {
            throw new ConflictException("Feedback already submitted for this shift");
        }

        // Validate shift belongs to tenant and employee
        shiftRepository.findByIdAndTenantId(shiftId, tenantId)
                .filter(s -> s.getEmployeeId().equals(employeeId))
                .orElseThrow(() -> new ValidationException(
                        "Shift not found or does not belong to employee"));

        ShiftFeedback feedback = ShiftFeedback.builder()
                .tenantId(tenantId)
                .shiftId(shiftId)
                .employeeId(employeeId)
                .rating(req.getRating())
                .issues(req.getIssues() != null ? req.getIssues() : "[]")
                .equipmentFlags(req.getEquipmentFlags() != null ? req.getEquipmentFlags() : "[]")
                .moraleNote(req.getMoraleNote())
                .build();
        return feedbackRepository.save(feedback);
    }

    @Transactional(readOnly = true)
    public List<ShiftFeedback> getFeedbackForShift(UUID tenantId, UUID shiftId) {
        Instant from = Instant.EPOCH;
        Instant to = Instant.now();
        return feedbackRepository.findByTenantIdAndSubmittedAtBetween(tenantId, from, to)
                .stream()
                .filter(f -> f.getShiftId().equals(shiftId))
                .toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getFeedbackSummary(UUID tenantId, int weeks) {
        Instant from = Instant.now().minus(weeks * 7L, ChronoUnit.DAYS);
        Instant to = Instant.now();
        List<ShiftFeedback> feedbacks = feedbackRepository.findByTenantIdAndSubmittedAtBetween(tenantId, from, to);

        double avgRating = feedbacks.stream()
                .mapToInt(ShiftFeedback::getRating)
                .average()
                .orElse(0);

        long totalFeedback = feedbacks.size();

        return Map.of(
                "average_rating", BigDecimal.valueOf(avgRating).setScale(2, RoundingMode.HALF_UP),
                "total_feedback", totalFeedback,
                "period_weeks", weeks
        );
    }
}
