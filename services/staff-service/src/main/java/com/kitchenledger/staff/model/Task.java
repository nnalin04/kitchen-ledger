package com.kitchenledger.staff.model;

import com.kitchenledger.staff.model.enums.TaskPriority;
import com.kitchenledger.staff.model.enums.TaskStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "tasks")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "description")
    private String description;

    @Column(name = "assigned_to")
    private UUID assignedTo;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false)
    @Builder.Default
    private TaskPriority priority = TaskPriority.medium;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private TaskStatus status = TaskStatus.pending;

    @Column(name = "is_recurring", nullable = false)
    @Builder.Default
    private boolean recurring = false;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
