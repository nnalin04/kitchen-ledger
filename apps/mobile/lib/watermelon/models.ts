import { Model } from '@nozbe/watermelondb';
import { field, readonly, date, text } from '@nozbe/watermelondb/decorators';

export class InventoryItem extends Model {
  static table = 'inventory_items';

  @text('server_id') serverId!: string;
  @text('tenant_id') tenantId!: string;
  @text('name') name!: string;
  @text('category') category!: string;
  @text('abc_category') abcCategory!: string;
  @field('current_stock') currentStock!: number;
  @field('par_level') parLevel!: number;
  @text('count_unit') countUnit!: string;
  @text('storage_location') storageLocation!: string;
  @field('is_perishable') isPerishable!: boolean;
  @field('avg_cost') avgCost!: number;
  @field('synced_at') syncedAt!: number;

  get isLowStock(): boolean {
    return this.currentStock <= this.parLevel;
  }
}

export class WasteLogPending extends Model {
  static table = 'waste_logs_pending';

  @text('inventory_item_id') inventoryItemId!: string;
  @field('quantity') quantity!: number;
  @text('unit') unit!: string;
  @text('reason') reason!: string;
  @text('station') station!: string;
  @text('photo_url') photoUrl!: string;
  @text('notes') notes!: string;
  @field('logged_at') loggedAt!: number;
  @field('synced') synced!: boolean;
}

export class CountSessionItem extends Model {
  static table = 'count_session_items';

  @text('count_session_id') countSessionId!: string;
  @text('inventory_item_id') inventoryItemId!: string;
  @text('server_count_item_id') serverCountItemId!: string;
  @field('counted_quantity') countedQuantity!: number;
  @text('unit') unit!: string;
  @field('synced') synced!: boolean;
}
