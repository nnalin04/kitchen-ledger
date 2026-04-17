package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CompleteTaskRequest;
import com.kitchenledger.staff.dto.request.CreateTaskRequest;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Task;
import com.kitchenledger.staff.model.TaskCompletion;
import com.kitchenledger.staff.model.enums.TaskStatus;
import com.kitchenledger.staff.repository.TaskCompletionRepository;
import com.kitchenledger.staff.repository.TaskRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TaskService {

    private final TaskRepository taskRepository;
    private final TaskCompletionRepository completionRepository;

    @Transactional(readOnly = true)
    public Page<Task> list(UUID tenantId, TaskStatus status, Pageable pageable) {
        if (status != null) {
            return taskRepository.findByTenantIdAndStatusAndDeletedAtIsNullOrderByDueDateAsc(
                    tenantId, status, pageable);
        }
        return taskRepository.findByTenantIdAndDeletedAtIsNullOrderByDueDateAsc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public Task getById(UUID tenantId, UUID id) {
        return taskRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Task not found: " + id));
    }

    @Transactional(readOnly = true)
    public List<Task> listForEmployee(UUID tenantId, UUID employeeId, TaskStatus status) {
        TaskStatus s = status != null ? status : TaskStatus.pending;
        return taskRepository.findByTenantIdAndAssignedToAndStatusAndDeletedAtIsNull(
                tenantId, employeeId, s);
    }

    @Transactional
    public Task create(UUID tenantId, UUID createdBy, CreateTaskRequest req) {
        Task task = Task.builder()
                .tenantId(tenantId)
                .title(req.getTitle())
                .description(req.getDescription())
                .assignedTo(req.getAssignedTo())
                .dueDate(req.getDueDate())
                .priority(req.getPriority())
                .recurring(req.isRecurring())
                .createdBy(createdBy)
                .build();
        return taskRepository.save(task);
    }

    @Transactional
    public Task update(UUID tenantId, UUID id, CreateTaskRequest req) {
        Task task = getById(tenantId, id);
        if (task.getStatus() == TaskStatus.completed || task.getStatus() == TaskStatus.cancelled) {
            throw new ValidationException("Cannot update a " + task.getStatus() + " task.");
        }
        task.setTitle(req.getTitle());
        task.setDescription(req.getDescription());
        task.setAssignedTo(req.getAssignedTo());
        task.setDueDate(req.getDueDate());
        task.setPriority(req.getPriority());
        task.setRecurring(req.isRecurring());
        return taskRepository.save(task);
    }

    @Transactional
    public TaskCompletion complete(UUID tenantId, UUID id, CompleteTaskRequest req) {
        Task task = getById(tenantId, id);
        if (task.getStatus() == TaskStatus.completed) {
            throw new ValidationException("Task is already completed.");
        }
        task.setStatus(TaskStatus.completed);
        taskRepository.save(task);

        return completionRepository.save(TaskCompletion.builder()
                .taskId(task.getId())
                .tenantId(tenantId)
                .completedBy(req.getCompletedBy())
                .completedAt(Instant.now())
                .notes(req.getNotes())
                .photoUrl(req.getPhotoUrl())
                .build());
    }

    @Transactional
    public Task updateStatus(UUID tenantId, UUID id, TaskStatus newStatus) {
        Task task = getById(tenantId, id);
        task.setStatus(newStatus);
        return taskRepository.save(task);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Task task = getById(tenantId, id);
        task.setDeletedAt(Instant.now());
        taskRepository.save(task);
    }
}
