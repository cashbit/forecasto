#!/usr/bin/env python3
"""Test diretto del refactoring controllando la struttura delle risposte."""

import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from forecasto.database import get_db
from forecasto.models.workspace import Workspace, WorkspaceMember
from forecasto.schemas.workspace import MemberResponse

async def test_model_validate():
    """Testa che .model_validate() funzioni correttamente con eager loading."""

    print("=" * 60)
    print("TEST REFACTORING - Verifica .model_validate()")
    print("=" * 60)

    async for db in get_db():
        # 1. Query con eager loading (come nel service refactorizzato)
        print("\n1. Query con selectinload (eager loading)...")
        result = await db.execute(
            select(WorkspaceMember)
            .options(selectinload(WorkspaceMember.user))
            .limit(1)
        )
        member = result.scalar_one_or_none()

        if not member:
            print("   ❌ Nessun membro trovato nel DB")
            return

        print(f"   ✓ Trovato member ID: {member.id}")
        print(f"     User: {member.user.name} ({member.user.email})")
        print(f"     Role: {member.role}")

        # 2. Test .model_validate() diretto
        print("\n2. Test MemberResponse.model_validate()...")
        try:
            response = MemberResponse.model_validate(member)
            print("   ✓ .model_validate() eseguito con successo!")

            # 3. Verifica campi
            print("\n3. Verifica campi nella risposta...")
            from datetime import datetime as dt
            required_fields = {
                "id": str,
                "user": dict,
                "role": str,
                "area_permissions": dict,
                "granular_permissions": (dict, type(None)),
                "can_view_in_consolidated_cashflow": bool,
                "can_import": bool,
                "can_import_sdi": bool,
                "can_export": bool,
                "joined_at": dt,  # datetime object (serializzato come string in JSON)
            }

            response_dict = response.model_dump()

            all_ok = True
            for field, expected_type in required_fields.items():
                if field not in response_dict:
                    print(f"   ❌ Campo mancante: {field}")
                    all_ok = False
                else:
                    value = response_dict[field]
                    if isinstance(expected_type, tuple):
                        if not any(isinstance(value, t) for t in expected_type):
                            print(f"   ❌ {field}: tipo errato (atteso {expected_type}, ottenuto {type(value)})")
                            all_ok = False
                        else:
                            print(f"   ✓ {field}: {type(value).__name__}")
                    else:
                        if not isinstance(value, expected_type):
                            print(f"   ❌ {field}: tipo errato (atteso {expected_type}, ottenuto {type(value)})")
                            all_ok = False
                        else:
                            print(f"   ✓ {field}: {type(value).__name__}")

            # 4. Verifica nested user
            print("\n4. Verifica nested user object...")
            user = response_dict["user"]
            user_fields = {"id": str, "email": str, "name": str}

            for field, expected_type in user_fields.items():
                if field not in user:
                    print(f"   ❌ user.{field} mancante")
                    all_ok = False
                elif not isinstance(user[field], expected_type):
                    print(f"   ❌ user.{field}: tipo errato")
                    all_ok = False
                else:
                    print(f"   ✓ user.{field}: {user[field][:30]}..." if len(str(user[field])) > 30 else f"   ✓ user.{field}: {user[field]}")

            # 5. Verifica permessi workspace-level
            print("\n5. Verifica permessi workspace-level...")
            print(f"   • can_import: {response_dict['can_import']}")
            print(f"   • can_import_sdi: {response_dict['can_import_sdi']}")
            print(f"   • can_export: {response_dict['can_export']}")

            if all_ok:
                print("\n" + "=" * 60)
                print("✅ TEST COMPLETATO CON SUCCESSO!")
                print("=" * 60)
                print("\nVerifica:")
                print("  ✓ Eager loading funziona correttamente")
                print("  ✓ .model_validate() crea MemberResponse automaticamente")
                print("  ✓ Tutti i campi sono presenti e con tipo corretto")
                print("  ✓ Nested user object è mappato correttamente")
                print("  ✓ Permessi workspace-level sono inclusi")
                print("\nIl refactoring è FUNZIONANTE e SICURO!")
                print("=" * 60)
            else:
                print("\n❌ ALCUNI TEST FALLITI - Verifica i dettagli sopra")

        except Exception as e:
            print(f"   ❌ Errore durante .model_validate(): {e}")
            import traceback
            traceback.print_exc()
            return

        break  # Usciamo dal generatore dopo il primo DB

if __name__ == "__main__":
    asyncio.run(test_model_validate())
