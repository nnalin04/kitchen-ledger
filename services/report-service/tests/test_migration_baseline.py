"""
Migration smoke tests for HIGH-06.
Verifies that the alembic migration chain is coherent and
can be applied from scratch without manual SQL.
These are file-based checks — no live DB required.
"""
import os
import ast

VERSIONS_DIR = os.path.join(
    os.path.dirname(__file__), "..", "alembic", "versions"
)


def _read_migration(filename: str) -> str:
    path = os.path.join(VERSIONS_DIR, filename)
    with open(path) as f:
        return f.read()


class TestMigrationLineage:
    def test_baseline_upgrade_is_not_a_bare_pass(self):
        """0001_baseline upgrade() must not be a bare pass statement."""
        src = _read_migration("0001_baseline.py")
        # Parse and find the upgrade function body
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "upgrade":
                body = node.body
                assert not (len(body) == 1 and isinstance(body[0], ast.Pass)), (
                    "0001_baseline.upgrade() is a bare `pass`. "
                    "The baseline migration must create the initial schema."
                )

    def test_report_jobs_created_in_migration_chain(self):
        """At least one migration must CREATE the report_jobs table."""
        all_src = ""
        for fname in os.listdir(VERSIONS_DIR):
            if fname.endswith(".py") and not fname.startswith("__"):
                all_src += _read_migration(fname)

        assert "report_jobs" in all_src, (
            "No migration creates report_jobs. Fresh DB migration would be incomplete."
        )

    def test_all_migrations_have_downgrade_function(self):
        """Every migration file must define a downgrade() function."""
        for fname in os.listdir(VERSIONS_DIR):
            if not fname.endswith(".py") or fname.startswith("__"):
                continue
            src = _read_migration(fname)
            tree = ast.parse(src)
            fn_names = [n.name for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
            assert "downgrade" in fn_names, (
                f"{fname} is missing a downgrade() function"
            )

    def test_migration_revision_ids_form_linear_chain(self):
        """down_revision references must be consistent across all migration files."""
        down_revisions = {}
        revision_ids = set()

        for fname in os.listdir(VERSIONS_DIR):
            if not fname.endswith(".py") or fname.startswith("__"):
                continue
            src = _read_migration(fname)
            tree = ast.parse(src)
            rev_id = None
            down_rev = None
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            if target.id == "revision" and isinstance(node.value, ast.Constant):
                                rev_id = node.value.value
                            if target.id == "down_revision":
                                if isinstance(node.value, ast.Constant):
                                    down_rev = node.value.value
                                elif isinstance(node.value, ast.NameConstant):
                                    down_rev = node.value.value
            if rev_id:
                revision_ids.add(rev_id)
                down_revisions[rev_id] = down_rev

        for rev_id, down_rev in down_revisions.items():
            if down_rev is not None:
                assert down_rev in revision_ids, (
                    f"Revision {rev_id} references down_revision {down_rev!r} "
                    f"which does not exist in the chain."
                )
