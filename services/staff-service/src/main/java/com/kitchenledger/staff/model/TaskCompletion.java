package com.kitchenledger.staff.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "task_completions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskCompletion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "task_id", nullable = false)
    private UUID taskId;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "completed_by", nullable = false)
    private UUID completedBy;

    @Column(name = "completed_at", nullable = false)
    @Builder.Default
    private Instant completedAt = Instant.now();

    @Column(name = "notes")
    private String notes;

    @Column(name = "photo_url")
    private String photoUrl;
}
