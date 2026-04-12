package com.kitchenledger.auth.dto.response;

import com.kitchenledger.auth.model.User;
import com.kitchenledger.auth.model.enums.UserRole;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
public class UserResponse {

    private UUID id;
    private UUID tenantId;
    private String email;
    private String fullName;
    private String phone;
    private UserRole role;
    private boolean active;
    private boolean verified;
    private String avatarUrl;
    private String language;
    private Instant lastLoginAt;
    private Instant createdAt;

    public static UserResponse from(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .tenantId(user.getTenantId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .phone(user.getPhone())
                .role(user.getRole())
                .active(user.isActive())
                .verified(user.isVerified())
                .avatarUrl(user.getAvatarUrl())
                .language(user.getLanguage())
                .lastLoginAt(user.getLastLoginAt())
                .createdAt(user.getCreatedAt())
                .build();
    }
}
