package com.kitchenledger.auth.service;

import com.kitchenledger.auth.dto.request.UpdateProfileRequest;
import com.kitchenledger.auth.dto.request.UpdateUserRequest;
import com.kitchenledger.auth.dto.response.UserResponse;
import com.kitchenledger.auth.exception.ResourceNotFoundException;
import com.kitchenledger.auth.model.User;
import com.kitchenledger.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public UserResponse getById(UUID userId) {
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));
        return UserResponse.from(user);
    }

    @Transactional(readOnly = true)
    public List<UserResponse> listByTenant(UUID tenantId) {
        return userRepository.findByTenantIdAndDeletedAtIsNull(tenantId)
                .stream()
                .map(UserResponse::from)
                .toList();
    }

    @Transactional
    public UserResponse updateProfile(UUID userId, UpdateProfileRequest req) {
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        if (req.getFullName() != null)  user.setFullName(req.getFullName());
        if (req.getPhone() != null)     user.setPhone(req.getPhone());
        if (req.getLanguage() != null)  user.setLanguage(req.getLanguage());

        return UserResponse.from(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateUser(UUID userId, UUID tenantId, UpdateUserRequest req) {
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        // Ensure user belongs to the requesting tenant
        if (!user.getTenantId().equals(tenantId)) {
            throw new ResourceNotFoundException("User", userId);
        }

        if (req.getRole() != null)    user.setRole(req.getRole());
        if (req.getActive() != null)  user.setActive(req.getActive());

        return UserResponse.from(userRepository.save(user));
    }
}
