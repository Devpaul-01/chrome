"""
Database Schema Validation Script
Tests that all SQLAlchemy models are correctly defined
"""
from app.db.models import (
    User, 
    SubscriptionRecord, 
    TemplateSegment,
    BirthdaySchedule,
    MessageQueue,
    MessageHistory,
    PasswordResetToken
)

def validate_model(model_class, expected_table_name):
    """Validate that a model has the expected table name and required attributes"""
    print(f"\n✅ Testing {model_class.__name__}...")
    
    # Check table name
    assert model_class.__tablename__ == expected_table_name, \
        f"Expected table '{expected_table_name}', got '{model_class.__tablename__}'"
    print(f"   ✓ Table name: {expected_table_name}")
    
    # Check has primary key
    mapper = model_class.__mapper__
    pk_cols = [col.name for col in mapper.primary_key]
    assert pk_cols, f"No primary key defined for {model_class.__name__}"
    print(f"   ✓ Primary key: {', '.join(pk_cols)}")
    
    # Check has columns
    columns = [col.name for col in mapper.columns]
    assert len(columns) > 0, f"No columns defined for {model_class.__name__}"
    print(f"   ✓ Columns ({len(columns)}): {', '.join(columns[:5])}{'...' if len(columns) > 5 else ''}")
    
    # Check relationships
    relationships = list(mapper.relationships.keys())
    if relationships:
        print(f"   ✓ Relationships: {', '.join(relationships)}")
    
    return True

def main():
    print("=" * 70)
    print("DATABASE SCHEMA VALIDATION")
    print("=" * 70)
    
    models_to_test = [
        (User, "users"),
        (SubscriptionRecord, "subscription_records"),
        (TemplateSegment, "template_segments"),
        (BirthdaySchedule, "birthday_schedules"),
        (MessageQueue, "message_queue"),
        (MessageHistory, "message_history"),
        (PasswordResetToken, "password_reset_tokens"),
    ]
    
    passed = 0
    failed = 0
    
    for model_class, table_name in models_to_test:
        try:
            validate_model(model_class, table_name)
            passed += 1
        except AssertionError as e:
            print(f"\n❌ FAILED: {model_class.__name__}")
            print(f"   Error: {e}")
            failed += 1
        except Exception as e:
            print(f"\n❌ ERROR: {model_class.__name__}")
            print(f"   {type(e).__name__}: {e}")
            failed += 1
    
    print("\n" + "=" * 70)
    print(f"VALIDATION SUMMARY")
    print("=" * 70)
    print(f"✅ Passed: {passed}/{len(models_to_test)}")
    if failed > 0:
        print(f"❌ Failed: {failed}/{len(models_to_test)}")
    else:
        print("🎉 All models validated successfully!")
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
