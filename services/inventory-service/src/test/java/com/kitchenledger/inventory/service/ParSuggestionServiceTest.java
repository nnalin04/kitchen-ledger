package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.PoSuggestion;
import com.kitchenledger.inventory.model.enums.PoSuggestionStatus;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.PoSuggestionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ParSuggestionServiceTest {

    @Mock private InventoryItemRepository itemRepository;
    @Mock private PoSuggestionRepository suggestionRepository;
    @Mock private InventoryEventPublisher eventPublisher;

    @InjectMocks private ParSuggestionService parSuggestionService;

    private final UUID TENANT = UUID.randomUUID();

    // ── PAR formula ───────────────────────────────────────────────────────────

    @Test
    void computedParLevel_formula_isAvgDailyUsageTimesLeadTimePlusSafetyStock() {
        // PAR = (avgDailyUsage * leadTimeDays) + safetyStock
        // PAR = (5 * 3) + 2 = 17
        BigDecimal computed = ParSuggestionService.computeParLevel(
                new BigDecimal("5"),
                3,
                new BigDecimal("2")
        );
        assertThat(computed).isEqualByComparingTo(new BigDecimal("17.0000"));
    }

    @Test
    void computedParLevel_zeroLeadTime_equalsSafetyStock() {
        BigDecimal computed = ParSuggestionService.computeParLevel(
                new BigDecimal("10"), 0, new BigDecimal("5")
        );
        assertThat(computed).isEqualByComparingTo(new BigDecimal("5.0000"));
    }

    // ── generateSuggestions ───────────────────────────────────────────────────

    @Test
    void generateSuggestions_belowPar_createsSuggestion() {
        InventoryItem item = itemBelowPar("Onion", new BigDecimal("3"), new BigDecimal("17"));

        when(itemRepository.findBelowParLevel(TENANT)).thenReturn(List.of(item));
        when(suggestionRepository.existsByTenantIdAndInventoryItemIdAndStatus(
                TENANT, item.getId(), PoSuggestionStatus.pending)).thenReturn(false);
        when(suggestionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        int count = parSuggestionService.generateSuggestions(TENANT);

        assertThat(count).isEqualTo(1);
        ArgumentCaptor<PoSuggestion> captor = ArgumentCaptor.forClass(PoSuggestion.class);
        verify(suggestionRepository).save(captor.capture());
        PoSuggestion suggestion = captor.getValue();
        assertThat(suggestion.getInventoryItemId()).isEqualTo(item.getId());
        assertThat(suggestion.getSuggestedQuantity()).isEqualByComparingTo("14.0000"); // 17 - 3
        assertThat(suggestion.getStatus()).isEqualTo(PoSuggestionStatus.pending);
    }

    @Test
    void generateSuggestions_pendingSuggestionAlreadyExists_skipsItem() {
        InventoryItem item = itemBelowPar("Tomato", new BigDecimal("2"), new BigDecimal("10"));

        when(itemRepository.findBelowParLevel(TENANT)).thenReturn(List.of(item));
        when(suggestionRepository.existsByTenantIdAndInventoryItemIdAndStatus(
                TENANT, item.getId(), PoSuggestionStatus.pending)).thenReturn(true);

        int count = parSuggestionService.generateSuggestions(TENANT);

        assertThat(count).isEqualTo(0);
        verify(suggestionRepository, never()).save(any());
    }

    @Test
    void generateSuggestions_publishesStockLowEventWithSuggestionRef() {
        InventoryItem item = itemBelowPar("Flour", new BigDecimal("1"), new BigDecimal("20"));

        when(itemRepository.findBelowParLevel(TENANT)).thenReturn(List.of(item));
        when(suggestionRepository.existsByTenantIdAndInventoryItemIdAndStatus(
                TENANT, item.getId(), PoSuggestionStatus.pending)).thenReturn(false);
        when(suggestionRepository.save(any())).thenAnswer(inv -> {
            PoSuggestion s = inv.getArgument(0);
            // Simulate DB assigning an ID
            return PoSuggestion.builder()
                    .id(UUID.randomUUID())
                    .tenantId(s.getTenantId())
                    .inventoryItemId(s.getInventoryItemId())
                    .suggestedQuantity(s.getSuggestedQuantity())
                    .currentStock(s.getCurrentStock())
                    .parLevel(s.getParLevel())
                    .status(PoSuggestionStatus.pending)
                    .build();
        });

        parSuggestionService.generateSuggestions(TENANT);

        verify(eventPublisher).publishStockLow(eq(TENANT), eq(item), any(UUID.class));
    }

    @Test
    void generateSuggestions_noBelowParItems_returnsZero() {
        when(itemRepository.findBelowParLevel(TENANT)).thenReturn(List.of());

        int count = parSuggestionService.generateSuggestions(TENANT);

        assertThat(count).isEqualTo(0);
        verifyNoInteractions(suggestionRepository, eventPublisher);
    }

    // ── approve ───────────────────────────────────────────────────────────────

    @Test
    void approve_pendingSuggestion_transitionsToApproved() {
        PoSuggestion suggestion = pendingSuggestion();
        UUID approver = UUID.randomUUID();

        when(suggestionRepository.findByIdAndTenantId(suggestion.getId(), TENANT))
                .thenReturn(Optional.of(suggestion));
        when(suggestionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PoSuggestion result = parSuggestionService.approve(TENANT, suggestion.getId(), approver);

        assertThat(result.getStatus()).isEqualTo(PoSuggestionStatus.approved);
        assertThat(result.getApprovedBy()).isEqualTo(approver);
    }

    @Test
    void approve_alreadyApproved_throwsValidation() {
        PoSuggestion suggestion = pendingSuggestion();
        suggestion.setStatus(PoSuggestionStatus.approved);

        when(suggestionRepository.findByIdAndTenantId(suggestion.getId(), TENANT))
                .thenReturn(Optional.of(suggestion));

        assertThatThrownBy(() -> parSuggestionService.approve(TENANT, suggestion.getId(), UUID.randomUUID()))
                .isInstanceOf(com.kitchenledger.inventory.exception.ValidationException.class)
                .hasMessageContaining("only pending");
    }

    // ── reject ────────────────────────────────────────────────────────────────

    @Test
    void reject_pendingSuggestion_transitionsToRejected() {
        PoSuggestion suggestion = pendingSuggestion();

        when(suggestionRepository.findByIdAndTenantId(suggestion.getId(), TENANT))
                .thenReturn(Optional.of(suggestion));
        when(suggestionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PoSuggestion result = parSuggestionService.reject(TENANT, suggestion.getId());

        assertThat(result.getStatus()).isEqualTo(PoSuggestionStatus.rejected);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private InventoryItem itemBelowPar(String name, BigDecimal currentStock, BigDecimal parLevel) {
        return InventoryItem.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .name(name)
                .purchaseUnit("kg")
                .recipeUnit("kg")
                .countUnit("kg")
                .currentStock(currentStock)
                .parLevel(parLevel)
                .safetyStock(BigDecimal.TWO)
                .reorderQuantity(parLevel.subtract(currentStock))
                .avgCost(new BigDecimal("50"))
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }

    private PoSuggestion pendingSuggestion() {
        return PoSuggestion.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .inventoryItemId(UUID.randomUUID())
                .suggestedQuantity(new BigDecimal("14"))
                .currentStock(new BigDecimal("3"))
                .parLevel(new BigDecimal("17"))
                .status(PoSuggestionStatus.pending)
                .build();
    }
}
