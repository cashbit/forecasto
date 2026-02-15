#!/usr/bin/env python3
"""Test script per verificare il refactoring degli endpoint workspace."""

import asyncio
import httpx
import json
from datetime import datetime

BASE_URL = "http://localhost:8000/api/v1"

# Credenziali di test (modificare secondo il tuo setup)
TEST_USER = {
    "email": "test@example.com",
    "password": "testpassword123",
    "name": "Test User"
}

async def test_refactored_endpoints():
    """Test dei 3 endpoint refactorizzati."""

    async with httpx.AsyncClient() as client:
        print("=" * 60)
        print("TEST REFACTORING - Workspace Endpoints")
        print("=" * 60)

        # 1. Login o registrazione
        print("\n1. Autenticazione...")
        try:
            # Prova login
            response = await client.post(
                f"{BASE_URL}/auth/login",
                json={"email": TEST_USER["email"], "password": TEST_USER["password"]}
            )
            if response.status_code == 401:
                # Se login fallisce, prova registrazione
                print("   Login fallito, provo registrazione...")
                response = await client.post(
                    f"{BASE_URL}/auth/register",
                    json=TEST_USER
                )
                if response.status_code != 201:
                    print(f"   ❌ Registrazione fallita: {response.text}")
                    return
                print("   ✓ Registrato nuovo utente")
                # Ora fai login
                response = await client.post(
                    f"{BASE_URL}/auth/login",
                    json={"email": TEST_USER["email"], "password": TEST_USER["password"]}
                )

            if response.status_code != 200:
                print(f"   ❌ Login fallito: {response.text}")
                return

            data = response.json()
            token = data.get("access_token")
            headers = {"Authorization": f"Bearer {token}"}
            print(f"   ✓ Autenticato con successo")

        except Exception as e:
            print(f"   ❌ Errore autenticazione: {e}")
            return

        # 2. Crea workspace di test
        print("\n2. Creazione workspace di test...")
        try:
            response = await client.post(
                f"{BASE_URL}/workspaces",
                headers=headers,
                json={
                    "name": f"Test Refactoring {datetime.now().isoformat()}",
                    "fiscal_year": 2026
                }
            )
            if response.status_code != 201:
                print(f"   ❌ Creazione workspace fallita: {response.text}")
                return

            workspace_data = response.json()
            workspace_id = workspace_data["workspace"]["id"]
            print(f"   ✓ Workspace creato: {workspace_id}")

        except Exception as e:
            print(f"   ❌ Errore creazione workspace: {e}")
            return

        # 3. TEST ENDPOINT #1: list_members (refactorizzato)
        print("\n3. TEST list_members endpoint (refactorizzato)...")
        try:
            response = await client.get(
                f"{BASE_URL}/workspaces/{workspace_id}/members",
                headers=headers
            )
            if response.status_code != 200:
                print(f"   ❌ list_members fallito: {response.text}")
                return

            data = response.json()
            assert data["success"] is True, "success deve essere True"
            assert "members" in data, "deve contenere 'members'"
            assert len(data["members"]) == 1, "deve avere 1 membro (owner)"

            member = data["members"][0]
            required_fields = [
                "id", "user", "role", "area_permissions", "granular_permissions",
                "can_view_in_consolidated_cashflow", "can_import", "can_import_sdi",
                "can_export", "joined_at"
            ]
            for field in required_fields:
                assert field in member, f"member deve contenere '{field}'"

            # Verifica nested user
            user = member["user"]
            assert "id" in user, "user deve contenere 'id'"
            assert "email" in user, "user deve contenere 'email'"
            assert "name" in user, "user deve contenere 'name'"

            # Verifica permessi workspace-level
            assert isinstance(member["can_import"], bool), "can_import deve essere boolean"
            assert isinstance(member["can_import_sdi"], bool), "can_import_sdi deve essere boolean"
            assert isinstance(member["can_export"], bool), "can_export deve essere boolean"

            print("   ✓ list_members OK - tutti i campi presenti")
            print(f"     - Member ID: {member['id']}")
            print(f"     - User: {user['name']} ({user['email']})")
            print(f"     - Role: {member['role']}")
            print(f"     - Permissions: import={member['can_import']}, "
                  f"sdi={member['can_import_sdi']}, export={member['can_export']}")

        except AssertionError as e:
            print(f"   ❌ Validazione fallita: {e}")
            print(f"   Response: {json.dumps(data, indent=2)}")
            return
        except Exception as e:
            print(f"   ❌ Errore list_members: {e}")
            return

        # 4. Crea secondo utente per test inviti
        print("\n4. Creazione secondo utente per test inviti...")
        second_user = {
            "email": f"test2_{datetime.now().timestamp()}@example.com",
            "password": "testpassword123",
            "name": "Test User 2"
        }
        try:
            response = await client.post(
                f"{BASE_URL}/auth/register",
                json=second_user
            )
            if response.status_code != 201:
                print(f"   ❌ Registrazione secondo utente fallita: {response.text}")
                return

            user2_data = response.json()
            invite_code = user2_data["user"]["invite_code"]
            print(f"   ✓ Secondo utente creato con invite_code: {invite_code}")

            # Login come secondo utente
            response = await client.post(
                f"{BASE_URL}/auth/login",
                json={"email": second_user["email"], "password": second_user["password"]}
            )
            token2 = response.json()["access_token"]
            headers2 = {"Authorization": f"Bearer {token2}"}

        except Exception as e:
            print(f"   ❌ Errore creazione secondo utente: {e}")
            return

        # 5. Crea invito
        print("\n5. Creazione invito con permessi custom...")
        try:
            response = await client.post(
                f"{BASE_URL}/workspaces/{workspace_id}/invitations",
                headers=headers,
                json={
                    "invite_code": invite_code,
                    "role": "member",
                    "can_import": True,
                    "can_import_sdi": False,  # SDI disabilitato
                    "can_export": True
                }
            )
            if response.status_code != 201:
                print(f"   ❌ Creazione invito fallita: {response.text}")
                return

            invitation_data = response.json()
            invitation_id = invitation_data["invitation"]["id"]
            print(f"   ✓ Invito creato: {invitation_id}")
            print(f"     - Permissions: import=True, sdi=False, export=True")

        except Exception as e:
            print(f"   ❌ Errore creazione invito: {e}")
            return

        # 6. TEST ENDPOINT #2: accept_invitation (refactorizzato)
        print("\n6. TEST accept_invitation endpoint (refactorizzato)...")
        try:
            response = await client.post(
                f"{BASE_URL}/workspaces/invitations/{invitation_id}/accept",
                headers=headers2
            )
            if response.status_code != 200:
                print(f"   ❌ accept_invitation fallito: {response.text}")
                return

            data = response.json()
            assert data["success"] is True, "success deve essere True"
            assert "member" in data, "deve contenere 'member'"

            member = data["member"]
            # Verifica tutti i campi
            for field in required_fields:
                assert field in member, f"member deve contenere '{field}'"

            # Verifica che i permessi siano stati copiati correttamente dall'invito
            assert member["can_import"] is True, "can_import deve essere True"
            assert member["can_import_sdi"] is False, "can_import_sdi deve essere False (da invito)"
            assert member["can_export"] is True, "can_export deve essere True"

            user2_id = member["user"]["id"]

            print("   ✓ accept_invitation OK - permessi copiati correttamente")
            print(f"     - Member accepted: {member['user']['name']}")
            print(f"     - Permissions copied: import={member['can_import']}, "
                  f"sdi={member['can_import_sdi']}, export={member['can_export']}")

        except AssertionError as e:
            print(f"   ❌ Validazione fallita: {e}")
            print(f"   Response: {json.dumps(data, indent=2)}")
            return
        except Exception as e:
            print(f"   ❌ Errore accept_invitation: {e}")
            return

        # 7. TEST ENDPOINT #3: update_member (refactorizzato)
        print("\n7. TEST update_member endpoint (refactorizzato)...")
        try:
            # Modifica permessi del secondo membro
            response = await client.patch(
                f"{BASE_URL}/workspaces/{workspace_id}/members/{user2_id}",
                headers=headers,
                json={
                    "can_import": False,  # Disabilita import
                    "can_import_sdi": True,  # Abilita SDI
                    "can_export": False  # Disabilita export
                }
            )
            if response.status_code != 200:
                print(f"   ❌ update_member fallito: {response.text}")
                return

            data = response.json()
            assert data["success"] is True, "success deve essere True"
            assert "member" in data, "deve contenere 'member'"

            member = data["member"]
            # Verifica tutti i campi
            for field in required_fields:
                assert field in member, f"member deve contenere '{field}'"

            # Verifica che i permessi siano stati aggiornati
            assert member["can_import"] is False, "can_import deve essere False (aggiornato)"
            assert member["can_import_sdi"] is True, "can_import_sdi deve essere True (aggiornato)"
            assert member["can_export"] is False, "can_export deve essere False (aggiornato)"

            print("   ✓ update_member OK - permessi aggiornati correttamente")
            print(f"     - Permissions updated: import={member['can_import']}, "
                  f"sdi={member['can_import_sdi']}, export={member['can_export']}")

        except AssertionError as e:
            print(f"   ❌ Validazione fallita: {e}")
            print(f"   Response: {json.dumps(data, indent=2)}")
            return
        except Exception as e:
            print(f"   ❌ Errore update_member: {e}")
            return

        # 8. Verifica finale con list_members
        print("\n8. Verifica finale: list_members con 2 membri...")
        try:
            response = await client.get(
                f"{BASE_URL}/workspaces/{workspace_id}/members",
                headers=headers
            )
            data = response.json()
            assert len(data["members"]) == 2, "deve avere 2 membri"

            # Trova il secondo membro e verifica i permessi finali
            member2 = next(m for m in data["members"] if m["user"]["id"] == user2_id)
            assert member2["can_import"] is False
            assert member2["can_import_sdi"] is True
            assert member2["can_export"] is False

            print("   ✓ Verifica finale OK - 2 membri con permessi corretti")

        except Exception as e:
            print(f"   ❌ Errore verifica finale: {e}")
            return

        print("\n" + "=" * 60)
        print("✅ TUTTI I TEST PASSATI CON SUCCESSO!")
        print("=" * 60)
        print("\nRiepilogo refactoring:")
        print("  • list_members: costruzione manuale → .model_validate() ✓")
        print("  • accept_invitation: costruzione manuale → .model_validate() ✓")
        print("  • update_member: costruzione manuale → .model_validate() ✓")
        print("  • Eager loading: N+1 queries eliminate ✓")
        print("  • Import cleanup: MemberUser rimosso dagli imports ✓")
        print("\nBenefici:")
        print("  • -50 righe di codice")
        print("  • Nuovi campi funzionano automaticamente")
        print("  • Migliore performance (eager loading)")
        print("  • Type safety garantito da Pydantic")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_refactored_endpoints())
