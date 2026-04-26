package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.response.BulkImportResult;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.InventoryCategory;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.repository.InventoryCategoryRepository;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import com.kitchenledger.inventory.repository.StockReceiptItemRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BulkImportTest {

    @Mock private InventoryItemRepository itemRepository;
    @Mock private InventoryMovementRepository movementRepository;
    @Mock private InventoryEventPublisher eventPublisher;
    @Mock private InventoryCategoryRepository categoryRepository;
    @Mock private StockReceiptItemRepository stockReceiptItemRepository;

    @InjectMocks
    private InventoryItemService inventoryItemService;

    private final UUID tenantId = UUID.randomUUID();
    private final UUID userId   = UUID.randomUUID();

    private MultipartFile csvFile(String content) throws Exception {
        MultipartFile file = mock(MultipartFile.class);
        when(file.getInputStream())
                .thenReturn(new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)));
        return file;
    }

    // ── valid CSV (3 rows) → 3 items created ──────────────────────────────────

    @Test
    void bulkImport_validCsv_createsAllItems() throws Exception {
        String csv = "name,category_name,purchase_unit,recipe_unit,count_unit,par_level,reorder_quantity,abc_category,is_perishable\n"
                + "Tomatoes,Produce,kg,g,kg,10,20,A,true\n"
                + "Salt,Dry Goods,kg,g,kg,5,10,C,false\n"
                + "Olive Oil,Liquids,litre,ml,litre,3,6,B,false\n";

        when(categoryRepository.findByTenantIdAndDeletedAtIsNullOrderBySortOrderAsc(tenantId))
                .thenReturn(List.of());
        when(categoryRepository.save(any())).thenAnswer(inv -> {
            InventoryCategory cat = inv.getArgument(0);
            cat = InventoryCategory.builder()
                    .id(UUID.randomUUID()).tenantId(tenantId).name(cat.getName()).sortOrder(0).build();
            return cat;
        });

        List<InventoryItem> saved = List.of(
                InventoryItem.builder().id(UUID.randomUUID()).tenantId(tenantId).name("Tomatoes")
                        .purchaseUnit("kg").recipeUnit("g").countUnit("kg").build(),
                InventoryItem.builder().id(UUID.randomUUID()).tenantId(tenantId).name("Salt")
                        .purchaseUnit("kg").recipeUnit("g").countUnit("kg").build(),
                InventoryItem.builder().id(UUID.randomUUID()).tenantId(tenantId).name("Olive Oil")
                        .purchaseUnit("litre").recipeUnit("ml").countUnit("litre").build()
        );
        when(itemRepository.saveAll(anyList())).thenReturn(saved);

        BulkImportResult result = inventoryItemService.bulkImport(tenantId, userId, csvFile(csv));

        assertThat(result.getCreated()).isEqualTo(3);
        assertThat(result.getErrors()).isEmpty();
    }

    // ── invalid abc_category → ValidationException with row number ─────────────

    @Test
    void bulkImport_invalidAbcCategory_throwsValidationExceptionWithRowNumber() throws Exception {
        String csv = "name,category_name,purchase_unit,recipe_unit,count_unit,par_level,reorder_quantity,abc_category,is_perishable\n"
                + "Tomatoes,,kg,g,kg,,,X,false\n";

        MultipartFile file = csvFile(csv);

        assertThatThrownBy(() -> inventoryItemService.bulkImport(tenantId, userId, file))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Row 2")
                .hasMessageContaining("abc_category");
    }

    // ── blank name → ValidationException ─────────────────────────────────────

    @Test
    void bulkImport_blankName_throwsValidationException() throws Exception {
        String csv = "name,category_name,purchase_unit,recipe_unit,count_unit,par_level,reorder_quantity,abc_category,is_perishable\n"
                + "  ,,kg,g,kg,,,A,false\n";

        MultipartFile file = csvFile(csv);

        assertThatThrownBy(() -> inventoryItemService.bulkImport(tenantId, userId, file))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("name is required");
    }

    // ── partial data → items created with defaults ────────────────────────────

    @Test
    void bulkImport_partialData_createsItemsWithDefaults() throws Exception {
        // Only name provided — all other columns empty (no category → categoryRepository never called)
        String csv = "name,category_name,purchase_unit,recipe_unit,count_unit,par_level,reorder_quantity,abc_category,is_perishable\n"
                + "Sugar,,,,,,,,\n"
                + "Pepper,,,,,,,,\n";

        List<InventoryItem> saved = List.of(
                InventoryItem.builder().id(UUID.randomUUID()).tenantId(tenantId).name("Sugar")
                        .purchaseUnit("unit").recipeUnit("unit").countUnit("unit").build(),
                InventoryItem.builder().id(UUID.randomUUID()).tenantId(tenantId).name("Pepper")
                        .purchaseUnit("unit").recipeUnit("unit").countUnit("unit").build()
        );
        when(itemRepository.saveAll(anyList())).thenReturn(saved);

        BulkImportResult result = inventoryItemService.bulkImport(tenantId, userId, csvFile(csv));

        assertThat(result.getCreated()).isEqualTo(2);

        // Verify items were built with "unit" defaults
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<InventoryItem>> captor = ArgumentCaptor.forClass(List.class);
        verify(itemRepository).saveAll(captor.capture());
        List<InventoryItem> itemsToSave = captor.getValue();
        assertThat(itemsToSave).hasSize(2);
        assertThat(itemsToSave.get(0).getPurchaseUnit()).isEqualTo("unit");
        assertThat(itemsToSave.get(0).getParLevel()).isNull();
    }

    // ── invalid par_level → ValidationException ───────────────────────────────

    @Test
    void bulkImport_invalidParLevel_throwsValidationException() throws Exception {
        String csv = "name,category_name,purchase_unit,recipe_unit,count_unit,par_level,reorder_quantity,abc_category,is_perishable\n"
                + "Tomatoes,,kg,g,kg,notanumber,,A,false\n";

        MultipartFile file = csvFile(csv);

        assertThatThrownBy(() -> inventoryItemService.bulkImport(tenantId, userId, file))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("par_level");
    }
}
