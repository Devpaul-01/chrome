from pathlib import Path
def test_admin_switch_guard_precedes_recurring_lookup():
    source=Path('app/api/routers/plan_switch_intents.py').read_text()
    guard='if current.source_provider == "development_admin"'
    lookup='recurring = (await db.execute'
    assert guard in source
    assert lookup in source
    assert source.index(guard) < source.index(lookup)
