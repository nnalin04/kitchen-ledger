package com.kitchenledger.auth.repository;

import com.kitchenledger.auth.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    // Case-insensitive lookup for login (searches globally across tenants by email+tenant)
    @Query("SELECT u FROM User u WHERE LOWER(u.email) = LOWER(:email) AND u.tenantId = :tenantId AND u.deletedAt IS NULL")
    Optional<User> findByEmailAndTenantId(String email, UUID tenantId);

    // For register: check global email uniqueness on tenants table (not users)
    @Query("SELECT u FROM User u WHERE LOWER(u.email) = LOWER(:email) AND u.deletedAt IS NULL")
    Optional<User> findByEmailGlobal(String email);

    Optional<User> findByIdAndDeletedAtIsNull(UUID id);

    List<User> findByTenantIdAndDeletedAtIsNull(UUID tenantId);
}
