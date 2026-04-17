package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.TaskCompletion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface TaskCompletionRepository extends JpaRepository<TaskCompletion, UUID> {

    List<TaskCompletion> findByTaskIdOrderByCompletedAtDesc(UUID taskId);
}
