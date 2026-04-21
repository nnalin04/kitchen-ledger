package com.kitchenledger.finance.event;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    List<OutboxEvent> findByReplayedAtIsNullAndRetryCountLessThan(int maxRetries);

    @Query(value = """
            SELECT * FROM event_outbox
            WHERE replayed_at IS NULL AND retry_count < :maxRetries
            ORDER BY failed_at
            FOR UPDATE SKIP LOCKED
            """, nativeQuery = true)
    List<OutboxEvent> findPendingForUpdate(@Param("maxRetries") int maxRetries);
}
