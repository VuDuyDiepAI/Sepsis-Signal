"""Keep module boundaries and entry points clear as multiple people contribute."""

import ast
import importlib.util
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ArchitectureBoundaries(unittest.TestCase):
    def test_backend_boundaries_and_no_import_cycles(self):
        graph = {}
        for path in (ROOT / "backend").rglob("*.py"):
            module = ".".join(path.relative_to(ROOT).with_suffix("").parts)
            package = (
                module.removesuffix(".__init__")
                if path.name == "__init__.py"
                else module.rsplit(".", 1)[0]
            )
            key = module.removesuffix(".__init__")
            dependencies = set()
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if isinstance(node, ast.ImportFrom):
                    self.assertFalse(
                        any(alias.name == "*" for alias in node.names), str(path)
                    )
                    dependency = (
                        importlib.util.resolve_name(
                            "." * node.level + (node.module or ""), package
                        )
                        if node.level
                        else node.module
                    )
                    if dependency:
                        dependencies.add(dependency)
                elif isinstance(node, ast.Import):
                    dependencies.update(alias.name for alias in node.names)
            for dependency in dependencies:
                if key.startswith("backend.models"):
                    self.assertFalse(
                        dependency.startswith(
                            (
                                "backend.modules",
                                "backend.api",
                                "backend.bootstrap",
                                "backend.core.security",
                            )
                        ),
                        (key, dependency),
                    )
                if (
                    not key.startswith("backend.api")
                    and not key.endswith(".api")
                    and key != "backend.main"
                ):
                    self.assertFalse(
                        dependency == "backend.main"
                        or dependency.startswith("backend.api")
                        or dependency.startswith("backend.modules.")
                        and dependency.endswith(".api"),
                        (key, dependency),
                    )
            graph[key] = dependencies
        active, visited = set(), set()

        def visit(module):
            self.assertNotIn(module, active, "Circular backend import: " + module)
            if module in visited:
                return
            active.add(module)
            for dependency in graph[module]:
                if dependency in graph:
                    visit(dependency)
            active.remove(module)
            visited.add(module)

        for module in graph:
            visit(module)

    def test_frontend_shared_layer_and_aliases(self):
        source = ROOT / "src"
        self.assertEqual(
            {path.name for path in source.iterdir()},
            {"main.tsx", "app", "features", "shared"},
        )
        for path in source.rglob("*"):
            if path.suffix not in {".ts", ".tsx"}:
                continue
            for dependency in re.findall(
                r'(?:from\s+|import\s*)["\'](@/[^"\']+)["\']',
                path.read_text(encoding="utf-8"),
            ):
                target = source / dependency[2:]
                self.assertTrue(
                    any(
                        target.with_suffix(suffix).is_file()
                        for suffix in (".ts", ".tsx", ".css")
                    ),
                    (path, dependency),
                )
                if path.is_relative_to(source / "shared"):
                    self.assertFalse(
                        dependency.startswith(("@/features/", "@/app/")),
                        (path, dependency),
                    )

    def test_backend_entry_point_and_schema_history_remain_available(self):
        self.assertEqual(
            {path.name for path in (ROOT / "backend").glob("*.py")},
            {"main.py", "__init__.py"},
        )
        self.assertTrue((ROOT / "migrations/versions/001_identity.py").is_file())
        self.assertTrue((ROOT / "migrations/versions/008_three_roles.py").is_file())
        for filename in ("Dockerfile", "start.ps1"):
            self.assertIn(
                "backend.main:app", (ROOT / filename).read_text(encoding="utf-8")
            )


if __name__ == "__main__":
    unittest.main()
