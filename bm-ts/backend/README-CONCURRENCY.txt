BirthdayMessaging â€” PostgreSQL Concurrency Test Package
=========================================================

Purpose
-------
Runs real PostgreSQL concurrency tests against a disposable database named:

    birthdaymessaging_concurrency_test

It does NOT use the normal in-memory SQLite pytest database.

Safety
------
The Python test and PowerShell runner both refuse a database whose name does
not contain the word "test".

Installation
------------
Extract this ZIP directly into:

    bm-ts\backend

After extraction you should have:

    app\tests\test_postgres_entitlement_concurrency.py
    run-postgres-concurrency-tests.ps1

Run
---
Open PowerShell in bm-ts\backend and execute:

    powershell -ExecutionPolicy Bypass -File .\run-postgres-concurrency-tests.ps1

The runner will:

1. Check Docker services.
2. Recreate birthdaymessaging_concurrency_test.
3. Discover the backend's current DATABASE_URL automatically.
4. Apply Alembic migrations to the isolated database.
5. Run PostgreSQL concurrency tests.
6. Run the normal backend regression suite.
7. Drop the isolated database after successful tests.

Output files
------------
    postgres-concurrency-results.txt
    full-regression-after-concurrency.txt

Review both generated result files.

Tests included
--------------
* same user + two simultaneous distinct payments -> correctly stacked grants
* same payment processed concurrently -> exactly one grant
* two different users -> isolated grants
* outer transaction rollback -> no orphan grant
* 100 independent users/payments concurrently -> 100 unique grants

This 100-user test is a correctness/load smoke test, not a latency benchmark.
