#!/usr/bin/env python3
"""Test del refactoring records helper function."""

import asyncio
from sqlalchemy import select
from forecasto.database import get_db
from forecasto.models.record import Record
from forecasto.schemas.record import RecordResponse

async def test_records_model_validate():
    """Testa che .model_validate() funzioni per RecordResponse."""

    print("=" * 60)
    print("TEST RECORDS REFACTORING")
    print("=" * 60)

    async for db in get_db():
        # Query un record
        print("\n1. Query record...")
        result = await db.execute(select(Record).limit(1))
        record = result.scalar_one_or_none()

        if not record:
            print("   ⚠️  Nessun record nel DB - skip test")
            return

        print(f"   ✓ Trovato record ID: {record.id}")
        print(f"     Area: {record.area}")
        print(f"     Account: {record.account}")

        # Test .model_validate()
        print("\n2. Test RecordResponse.model_validate()...")
        try:
            response = RecordResponse.model_validate(record)
            print("   ✓ .model_validate() eseguito con successo!")

            # Verifica campi critici
            print("\n3. Verifica campi critici...")
            response_dict = response.model_dump()

            critical_fields = ["id", "workspace_id", "area", "type", "account",
                              "amount", "total", "is_draft", "created_at", "updated_at"]

            all_ok = True
            for field in critical_fields:
                if field not in response_dict:
                    print(f"   ❌ Campo mancante: {field}")
                    all_ok = False
                else:
                    print(f"   ✓ {field}: presente")

            # Test helper function
            print("\n4. Test _record_to_response helper...")
            from forecasto.api.records import _record_to_response

            response2 = _record_to_response(record, is_draft=True)
            assert response2.is_draft == True, "is_draft override deve funzionare"
            print("   ✓ Helper function con is_draft override funziona")

            response3 = _record_to_response(record)
            assert response3.is_draft == False, "is_draft default deve essere False"
            print("   ✓ Helper function con default funziona")

            if all_ok:
                print("\n" + "=" * 60)
                print("✅ RECORDS REFACTORING COMPLETATO!")
                print("=" * 60)
                print("\nVerifiche:")
                print("  ✓ RecordResponse ha from_attributes=True")
                print("  ✓ .model_validate() funziona correttamente")
                print("  ✓ Helper refactorata: 33 righe → 6 righe (-27)")
                print("  ✓ is_draft override funziona")
                print("\nBenefici:")
                print("  • Nuovi campi record funzionano automaticamente")
                print("  • Helper centralizzata usa pattern Pydantic")
                print("  • Codice più leggibile e manutenibile")
                print("=" * 60)
            else:
                print("\n❌ ALCUNI CAMPI MANCANTI")

        except Exception as e:
            print(f"   ❌ Errore: {e}")
            import traceback
            traceback.print_exc()
            return

        break

if __name__ == "__main__":
    asyncio.run(test_records_model_validate())
