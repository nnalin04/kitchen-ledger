package com.kitchenledger.auth.service;

import com.kitchenledger.auth.dto.request.UpdateProfileRequest;
import com.kitchenledger.auth.dto.request.UpdateUserRequest;
import com.kitchenledger.auth.dto.response.UserResponse;
import com.kitchenledger.auth.exception.ResourceNotFoundException;
import com.kitchenledger.auth.model.User;
import com.kitchenledger.auth.model.enums.UserRole;
import com.kitchenledger.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock UserRepository userRepository;
    @InjectMocks UserService userService;

    private UUID tenantId;
    private User user;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        user = User.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .email("staff@spicegarden.com")
                .fullName("Priya Singh")
                .role(UserRole.kitchen_staff)
                .active(true)
                .build();
    }

    @Test
    void getById_existingUser_returnsUserResponse() {
        when(userRepository.findByIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(user));

        UserResponse result = userService.getById(user.getId());

        assertThat(result.getId()).isEqualTo(user.getId());
        assertThat(result.getFullName()).isEqualTo("Priya Singh");
    }

    @Test
    void getById_missing_throwsNotFoundException() {
        UUID id = UUID.randomUUID();
        when(userRepository.findByIdAndDeletedAtIsNull(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> userService.getById(id))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void listByTenant_returnsAllActiveUsers() {
        when(userRepository.findByTenantIdAndDeletedAtIsNull(tenantId)).thenReturn(List.of(user));

        List<UserResponse> result = userService.listByTenant(tenantId);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getEmail()).isEqualTo("staff@spicegarden.com");
    }

    @Test
    void updateProfile_patchesOnlyProvidedFields() {
        when(userRepository.findByIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(user));
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UpdateProfileRequest req = new UpdateProfileRequest();
        req.setFullName("Priya Sharma");

        UserResponse result = userService.updateProfile(user.getId(), req);

        assertThat(result.getFullName()).isEqualTo("Priya Sharma");
        assertThat(result.getEmail()).isEqualTo("staff@spicegarden.com"); // unchanged
    }

    @Test
    void updateUser_changingRole_updatesRole() {
        when(userRepository.findByIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(user));
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UpdateUserRequest req = new UpdateUserRequest();
        req.setRole(UserRole.manager);

        UserResponse result = userService.updateUser(user.getId(), tenantId, req);

        assertThat(result.getRole()).isEqualTo(UserRole.manager);
    }

    @Test
    void updateUser_differentTenant_throwsNotFoundException() {
        when(userRepository.findByIdAndDeletedAtIsNull(user.getId())).thenReturn(Optional.of(user));

        UpdateUserRequest req = new UpdateUserRequest();
        req.setRole(UserRole.manager);

        UUID differentTenantId = UUID.randomUUID();
        assertThatThrownBy(() -> userService.updateUser(user.getId(), differentTenantId, req))
                .isInstanceOf(ResourceNotFoundException.class);
    }
}
