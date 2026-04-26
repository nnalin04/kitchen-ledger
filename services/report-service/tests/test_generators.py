"""
Tests for the modular generator and client modules added in REPORT epic.
"""
import os

# Required environment variables before any service module is imported
os.environ.setdefault("DATABASE_URL", "postgresql://kl_user:kl_password@localhost:5432/kitchenledger_test")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("FINANCE_SERVICE_URL", "http://localhost:8083")
os.environ.setdefault("INVENTORY_SERVICE_URL", "http://localhost:8082")
os.environ.setdefault("STAFF_SERVICE_URL", "http://localhost:8088")
os.environ.setdefault("INTERNAL_SERVICE_SECRET", "test-secret")


def test_pl_generator_returns_non_empty_pdf():
    from app.generators.pl_generator import generate
    mock_data = {
        "netSales": 100000,
        "totalCogs": 30000,
        "totalLabor": 25000,
        "totalOperating": 15000,
        "grossProfit": 70000,
        "netProfit": 30000,
    }
    pdf = generate(mock_data, "2024-01-01", "2024-01-31")
    assert len(pdf) > 1000
    assert pdf[:4] == b"%PDF"


def test_pl_generator_zero_sales_no_division_error():
    from app.generators.pl_generator import generate
    pdf = generate({"netSales": 0}, "2024-01-01", "2024-01-31")
    assert len(pdf) > 100


def test_pl_generator_partial_data_no_key_error():
    """Generator should handle missing optional keys gracefully."""
    from app.generators.pl_generator import generate
    pdf = generate({"netSales": 50000, "totalCogs": 20000}, "2024-02-01", "2024-02-29")
    assert pdf[:4] == b"%PDF"


def test_finance_client_module_importable():
    from app.clients import finance_client
    assert hasattr(finance_client, "get_pl_data")
    assert hasattr(finance_client, "get_expenses")


def test_inventory_client_module_importable():
    from app.clients import inventory_client
    assert hasattr(inventory_client, "get_items")
    assert hasattr(inventory_client, "get_waste")


def test_supabase_storage_module_importable():
    from app.storage import supabase
    assert hasattr(supabase, "upload_report")


def test_finance_client_has_dsr_function():
    from app.clients import finance_client
    assert hasattr(finance_client, "get_dsr_list")


def test_inventory_client_has_all_functions():
    from app.clients import inventory_client
    assert hasattr(inventory_client, "get_recipes")
    assert hasattr(inventory_client, "get_counts")


# ── REPORT-3: Additional generators spot-checks ────────────────────────────


def test_waste_generator_returns_non_empty_pdf():
    from app.generators.waste_generator import WasteReportGenerator
    gen = WasteReportGenerator()
    waste_data = [
        {"itemName": "Chicken Breast", "reason": "spoilage", "estimatedCost": "150.00",
         "station": "kitchen", "loggedAt": "2024-01-10T10:00:00Z"},
        {"itemName": "Lettuce", "reason": "overstock", "estimatedCost": "30.00",
         "station": "salad", "loggedAt": "2024-01-11T09:00:00Z"},
    ]
    pdf = gen.generate("tenant-1", {
        "start_date": "2024-01-01",
        "end_date": "2024-01-31",
        "waste_data": waste_data,
    })
    assert isinstance(pdf, bytes)
    assert len(pdf) > 0
    assert pdf[:4] == b"%PDF"


def test_waste_generator_empty_data_no_raise():
    from app.generators.waste_generator import WasteReportGenerator
    gen = WasteReportGenerator()
    pdf = gen.generate("tenant-1", {"start_date": "2024-01-01", "end_date": "2024-01-31"})
    assert pdf[:4] == b"%PDF"


def test_inventory_valuation_generator_returns_non_empty_pdf():
    from app.generators.inventory_valuation_generator import InventoryValuationGenerator
    gen = InventoryValuationGenerator()
    items = [
        {"name": "Basmati Rice", "abcCategory": "A", "currentStock": 50, "unit": "kg",
         "avgCost": "80.00"},
        {"name": "Vegetable Oil", "abcCategory": "B", "currentStock": 10, "unit": "litre",
         "avgCost": "120.00"},
        {"name": "Salt", "abcCategory": "C", "currentStock": 5, "unit": "kg",
         "avgCost": "20.00"},
    ]
    pdf = gen.generate("tenant-1", {"items": items})
    assert isinstance(pdf, bytes)
    assert len(pdf) > 0
    assert pdf[:4] == b"%PDF"


def test_inventory_valuation_generator_empty_data_no_raise():
    from app.generators.inventory_valuation_generator import InventoryValuationGenerator
    gen = InventoryValuationGenerator()
    pdf = gen.generate("tenant-1", {})
    assert pdf[:4] == b"%PDF"


def test_expense_breakdown_generator_returns_non_empty_pdf():
    from app.generators.expense_breakdown_generator import ExpenseBreakdownGenerator
    gen = ExpenseBreakdownGenerator()
    expenses = [
        {"category": "food", "amount": "5000.00"},
        {"category": "labor", "amount": "8000.00"},
        {"category": "utilities", "amount": "2000.00"},
    ]
    pdf = gen.generate("tenant-1", {
        "start_date": "2024-01-01",
        "end_date": "2024-01-31",
        "expenses": expenses,
        "revenue": 30000,
    })
    assert isinstance(pdf, bytes)
    assert len(pdf) > 0
    assert pdf[:4] == b"%PDF"


def test_expense_breakdown_generator_empty_data_no_raise():
    from app.generators.expense_breakdown_generator import ExpenseBreakdownGenerator
    gen = ExpenseBreakdownGenerator()
    pdf = gen.generate("tenant-1", {"start_date": "2024-01-01", "end_date": "2024-01-31"})
    assert pdf[:4] == b"%PDF"


def test_gst_summary_generator_returns_non_empty_csv():
    from app.generators.gst_summary_generator import GSTSummaryGenerator
    gen = GSTSummaryGenerator()
    dsr_list = [
        {"reportDate": "2024-01-15", "grossSales": "50000.00", "taxCollected": "2500.00"},
        {"reportDate": "2024-01-16", "grossSales": "45000.00", "taxCollected": "2250.00"},
    ]
    csv_bytes = gen.generate("tenant-1", {
        "start_date": "2024-01-01",
        "end_date": "2024-01-31",
        "dsr_list": dsr_list,
    })
    assert isinstance(csv_bytes, bytes)
    assert len(csv_bytes) > 0
    text = csv_bytes.decode("utf-8")
    assert "date" in text
    assert "tax_collected" in text
    assert "2024-01-15" in text


def test_gst_summary_generator_empty_data_no_raise():
    from app.generators.gst_summary_generator import GSTSummaryGenerator
    gen = GSTSummaryGenerator()
    csv_bytes = gen.generate("tenant-1", {"start_date": "2024-01-01", "end_date": "2024-01-31"})
    assert isinstance(csv_bytes, bytes)
    text = csv_bytes.decode("utf-8")
    assert "date" in text  # header row always present


def test_menu_engineering_generator_returns_non_empty_pdf():
    from app.generators.menu_engineering_generator import MenuEngineeringGenerator
    gen = MenuEngineeringGenerator()
    recipes = [
        {"name": "Butter Chicken", "menuMatrixCategory": "star",
         "foodCostPercent": "28.5", "menuPrice": "350.00"},
        {"name": "Dal Makhani", "menuMatrixCategory": "plowhorse",
         "foodCostPercent": "22.0", "menuPrice": "220.00"},
        {"name": "Prawn Masala", "menuMatrixCategory": "puzzle",
         "foodCostPercent": "38.0", "menuPrice": "450.00"},
        {"name": "Plain Chapati", "menuMatrixCategory": "dog",
         "foodCostPercent": "15.0", "menuPrice": "30.00"},
    ]
    pdf = gen.generate("tenant-1", {"recipes": recipes})
    assert isinstance(pdf, bytes)
    assert len(pdf) > 0
    assert pdf[:4] == b"%PDF"


def test_menu_engineering_generator_empty_data_no_raise():
    from app.generators.menu_engineering_generator import MenuEngineeringGenerator
    gen = MenuEngineeringGenerator()
    pdf = gen.generate("tenant-1", {})
    assert pdf[:4] == b"%PDF"


def test_supabase_storage_has_get_signed_url():
    from app.storage import supabase
    assert hasattr(supabase, "get_signed_url")
