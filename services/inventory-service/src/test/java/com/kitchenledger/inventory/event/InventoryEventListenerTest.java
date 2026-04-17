package com.kitchenledger.inventory.event;

import com.kitchenledger.inventory.service.StockReceiptService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InventoryEventListenerTest {

    @Mock
    private StockReceiptService stockReceiptService;

    @InjectMocks
    private InventoryEventListener inventoryEventListener;

    private final UUID tenantId   = UUID.randomUUID();
    private final UUID receiptId  = UUID.randomUUID();

    // ── ai.ocr.completed — delivery_note ─────────────────────────────────────

    @Test
    void onOcrCompleted_deliveryNote_withReferenceId_callsPrefillFromOcr() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("ai.ocr.completed")
                .tenantId(tenantId.toString())
                .payload(Map.of(
                        "document_type", "delivery_note",
                        "reference_id",  receiptId.toString(),
                        "line_items",    List.of(Map.of("name", "Tomatoes", "quantity", "5"))
                ))
                .build();

        inventoryEventListener.onEvent(envelope);

        verify(stockReceiptService).prefillFromOcr(eq(tenantId), eq(receiptId), anyList());
    }

    @Test
    void onOcrCompleted_receipt_withReferenceId_callsPrefillFromOcr() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("ai.ocr.completed")
                .tenantId(tenantId.toString())
                .payload(Map.of(
                        "document_type", "receipt",
                        "reference_id",  receiptId.toString(),
                        "line_items",    List.of(Map.of("name", "Flour", "quantity", "2"))
                ))
                .build();

        inventoryEventListener.onEvent(envelope);

        verify(stockReceiptService).prefillFromOcr(eq(tenantId), eq(receiptId), anyList());
    }

    @Test
    void onOcrCompleted_noReferenceId_skips() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("ai.ocr.completed")
                .tenantId(tenantId.toString())
                .payload(Map.of(
                        "document_type", "delivery_note"
                        // no reference_id
                ))
                .build();

        inventoryEventListener.onEvent(envelope);

        verify(stockReceiptService, never()).prefillFromOcr(any(), any(), any());
    }

    @Test
    void onOcrCompleted_wrongDocType_skips() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("ai.ocr.completed")
                .tenantId(tenantId.toString())
                .payload(Map.of(
                        "document_type", "invoice",
                        "reference_id",  receiptId.toString()
                ))
                .build();

        inventoryEventListener.onEvent(envelope);

        verify(stockReceiptService, never()).prefillFromOcr(any(), any(), any());
    }

    @Test
    void onOcrCompleted_emptyLineItems_callsPrefillFromOcrWithEmptyList() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("ai.ocr.completed")
                .tenantId(tenantId.toString())
                .payload(Map.of(
                        "document_type", "delivery_note",
                        "reference_id",  receiptId.toString()
                        // no line_items key — should default to empty list
                ))
                .build();

        inventoryEventListener.onEvent(envelope);

        verify(stockReceiptService).prefillFromOcr(eq(tenantId), eq(receiptId), eq(List.of()));
    }

    // ── unknown event ─────────────────────────────────────────────────────────

    @Test
    void onUnknownEvent_noOp() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("some.other.event")
                .tenantId(tenantId.toString())
                .payload(Map.of())
                .build();

        inventoryEventListener.onEvent(envelope);

        verify(stockReceiptService, never()).prefillFromOcr(any(), any(), any());
    }
}
