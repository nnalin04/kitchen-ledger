package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.SubmitShiftFeedbackRequest;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Shift;
import com.kitchenledger.staff.model.ShiftFeedback;
import com.kitchenledger.staff.model.enums.ShiftStatus;
import com.kitchenledger.staff.repository.ShiftFeedbackRepository;
import com.kitchenledger.staff.repository.ShiftRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ShiftFeedbackServiceTest {

    @Mock private ShiftFeedbackRepository feedbackRepository;
    @Mock private ShiftRepository shiftRepository;

    @InjectMocks private ShiftFeedbackService feedbackService;

    private UUID tenantId;
    private UUID employeeId;
    private UUID shiftId;

    @BeforeEach
    void setUp() {
        tenantId   = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        shiftId    = UUID.randomUUID();
    }

    // ── submitFeedback ────────────────────────────────────────────────────────

    @Test
    void submitFeedback_validRequest_saved() {
        SubmitShiftFeedbackRequest req = buildRequest(4, "[]", "[]", "Good shift");

        when(feedbackRepository.findByShiftIdAndEmployeeId(shiftId, employeeId))
                .thenReturn(Optional.empty());
        when(shiftRepository.findByIdAndTenantId(shiftId, tenantId))
                .thenReturn(Optional.of(shiftForEmployee(employeeId)));
        when(feedbackRepository.save(any(ShiftFeedback.class))).thenAnswer(inv -> inv.getArgument(0));

        ShiftFeedback result = feedbackService.submitFeedback(tenantId, shiftId, employeeId, req);

        assertThat(result.getRating()).isEqualTo(4);
        assertThat(result.getMoraleNote()).isEqualTo("Good shift");
        verify(feedbackRepository).save(any(ShiftFeedback.class));
    }

    @Test
    void submitFeedback_sameShiftSameEmployee_throwsConflictException() {
        SubmitShiftFeedbackRequest req = buildRequest(5, "[]", "[]", null);

        when(feedbackRepository.findByShiftIdAndEmployeeId(shiftId, employeeId))
                .thenReturn(Optional.of(existingFeedback()));

        assertThatThrownBy(() -> feedbackService.submitFeedback(tenantId, shiftId, employeeId, req))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already submitted");
        verify(feedbackRepository, never()).save(any());
    }

    @Test
    void submitFeedback_shiftNotBelongingToEmployee_throwsValidationException() {
        UUID otherEmployeeId = UUID.randomUUID();
        SubmitShiftFeedbackRequest req = buildRequest(3, "[]", "[]", null);

        when(feedbackRepository.findByShiftIdAndEmployeeId(shiftId, employeeId))
                .thenReturn(Optional.empty());
        // Shift belongs to a different employee
        when(shiftRepository.findByIdAndTenantId(shiftId, tenantId))
                .thenReturn(Optional.of(shiftForEmployee(otherEmployeeId)));

        assertThatThrownBy(() -> feedbackService.submitFeedback(tenantId, shiftId, employeeId, req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("does not belong to employee");
        verify(feedbackRepository, never()).save(any());
    }

    @Test
    void submitFeedback_shiftNotFound_throwsValidationException() {
        SubmitShiftFeedbackRequest req = buildRequest(3, "[]", "[]", null);

        when(feedbackRepository.findByShiftIdAndEmployeeId(shiftId, employeeId))
                .thenReturn(Optional.empty());
        when(shiftRepository.findByIdAndTenantId(shiftId, tenantId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> feedbackService.submitFeedback(tenantId, shiftId, employeeId, req))
                .isInstanceOf(ValidationException.class);
    }

    // ── getFeedbackSummary ────────────────────────────────────────────────────

    @Test
    void getFeedbackSummary_threeRatings_correctAverage() {
        // Ratings: 4, 5, 3 → avg = 4.0
        List<ShiftFeedback> feedbacks = List.of(
                feedbackWithRating(4),
                feedbackWithRating(5),
                feedbackWithRating(3)
        );

        when(feedbackRepository.findByTenantIdAndSubmittedAtBetween(eq(tenantId), any(Instant.class), any(Instant.class)))
                .thenReturn(feedbacks);

        Map<String, Object> summary = feedbackService.getFeedbackSummary(tenantId, 4);

        assertThat(summary.get("total_feedback")).isEqualTo(3L);
        assertThat(summary.get("period_weeks")).isEqualTo(4);
        // avg = (4+5+3)/3 = 4.0
        assertThat(summary.get("average_rating").toString()).isEqualTo("4.00");
    }

    @Test
    void getFeedbackSummary_noFeedback_returnsZeroAverage() {
        when(feedbackRepository.findByTenantIdAndSubmittedAtBetween(eq(tenantId), any(Instant.class), any(Instant.class)))
                .thenReturn(List.of());

        Map<String, Object> summary = feedbackService.getFeedbackSummary(tenantId, 2);

        assertThat(summary.get("total_feedback")).isEqualTo(0L);
        assertThat(summary.get("average_rating").toString()).isEqualTo("0.00");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private SubmitShiftFeedbackRequest buildRequest(int rating, String issues,
                                                     String equipmentFlags, String moraleNote) {
        SubmitShiftFeedbackRequest req = new SubmitShiftFeedbackRequest();
        req.setRating(rating);
        req.setIssues(issues);
        req.setEquipmentFlags(equipmentFlags);
        req.setMoraleNote(moraleNote);
        return req;
    }

    private Shift shiftForEmployee(UUID empId) {
        return Shift.builder()
                .id(shiftId)
                .tenantId(tenantId)
                .employeeId(empId)
                .shiftDate(LocalDate.now())
                .startTime(LocalTime.of(9, 0))
                .endTime(LocalTime.of(17, 0))
                .status(ShiftStatus.completed)
                .createdBy(UUID.randomUUID())
                .build();
    }

    private ShiftFeedback existingFeedback() {
        return ShiftFeedback.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .shiftId(shiftId)
                .employeeId(employeeId)
                .rating(5)
                .issues("[]")
                .equipmentFlags("[]")
                .submittedAt(Instant.now().minus(1, ChronoUnit.HOURS))
                .build();
    }

    private ShiftFeedback feedbackWithRating(int rating) {
        return ShiftFeedback.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .shiftId(UUID.randomUUID())
                .employeeId(UUID.randomUUID())
                .rating(rating)
                .issues("[]")
                .equipmentFlags("[]")
                .submittedAt(Instant.now())
                .build();
    }
}
