#!/usr/bin/env python3
"""Seed billing profiles and associate users on production."""

import sqlite3
import uuid
from datetime import datetime

DB_PATH = "forecasto.db"

PROFILES = [
    {
        "company_name": "TechMakers Srl",
        "vat_number": "08874730966",
        "master": "carlo@techmakers.io",
        "users": [
            "lorenzo.nesich@techmakers.io",
            "paolo@techmakers.io",
            "stefano@techmakers.io",
            "andrea.albinati@forecasto.it",
            "marco.fontebasso@forecasto.it",
            "claude@forecasto.it",
        ],
    },
    {
        "company_name": "Real Italian Estate Srl",
        "vat_number": "02667590992",
        "master": "msardi@realitalianestate.com",
        "users": [],
    },
    {
        "company_name": "Talent Garden Genova Srl",
        "vat_number": "02203070996",
        "master": "riccardo.prosperi@genova.talentgarden.it",
        "users": [],
    },
    {
        "company_name": "Mercomm srl",
        "vat_number": "03625790104",
        "master": "mara@mercomm.it",
        "users": [],
    },
    {
        "company_name": "Studio Archimede srl",
        "vat_number": "03752900104",
        "master": "spallarossa@studioarchimede.com",
        "users": [],
    },
    {
        "company_name": "Parodi&Parodi srl",
        "vat_number": "00159250109",
        "master": "deborah@parodieparodi.it",
        "users": [
            "simone@parodieparodi.it",
            "lara@parodieparodi.it",
            "leonardo.parodi@parodieparodi.it",
            "paola@parodieparodi.it",
            "valeria@parodieparodi.it",
            "alessandra@parodischool.it",
            "claudio@parodischool.it",
            "deborah@parodieparoditest.it",
        ],
    },
    {
        "company_name": "Fattore comunicazione srl",
        "vat_number": "02980860999",
        "master": "andrea@fattorecomunicazione.it",
        "users": [
            "paolo@fattorecomunicazione.it",
        ],
    },
    {
        "company_name": "Gruppo Orange srl",
        "vat_number": "08544430963",
        "master": "andrea.fattori@gruppo-orange.it",
        "users": [],
    },
    {
        "company_name": "Gabriele Carbone",
        "vat_number": "02604200994",
        "master": "gabrielecarbone@outlook.com",
        "users": [],
    },
    {
        "company_name": "Bruno Tintori",
        "vat_number": "09711500968",
        "master": "bruno@tintori.onmicrosoft.com",
        "users": [],
    },
    {
        "company_name": "Ilaria Scaliti",
        "vat_number": "00000000000",
        "master": "ilaria.scaliti@gmail.com",
        "users": [],
    },
    {
        "company_name": "Carlo Alberto Liga",
        "vat_number": "02103610990",
        "master": "carloalberto.liga@gmail.com",
        "users": [],
    },
]


def find_user(cursor, email):
    cursor.execute("SELECT id, name FROM users WHERE email = ? AND deleted_at IS NULL", (email,))
    return cursor.fetchone()


def main():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = datetime.utcnow().isoformat()

    for profile_data in PROFILES:
        company = profile_data["company_name"]
        vat = profile_data["vat_number"]
        master_email = profile_data["master"]
        other_emails = profile_data["users"]

        # Check if profile already exists (by vat_number)
        c.execute("SELECT id FROM billing_profiles WHERE vat_number = ?", (vat,))
        existing = c.fetchone()
        if existing:
            print(f"  SKIP {company} (P.IVA {vat}) - profilo gia esistente")
            continue

        # Find master user
        master = find_user(c, master_email)
        if not master:
            print(f"  WARN {company}: master {master_email} non trovato, creo profilo senza master")

        # Create billing profile
        profile_id = str(uuid.uuid4())
        all_users = [master_email] + other_emails
        found_users = []
        for email in all_users:
            user = find_user(c, email)
            if user:
                found_users.append((user[0], email, email == master_email))
            else:
                print(f"  WARN {company}: utente {email} non trovato, skip")

        max_users = max(len(found_users), 1)

        c.execute(
            """INSERT INTO billing_profiles
            (id, company_name, vat_number, setup_cost, monthly_cost_first_year,
             monthly_cost_after_first_year, monthly_page_quota, page_package_cost,
             max_users, created_at, updated_at)
            VALUES (?, ?, ?, 0, 0, 0, 0, 0, ?, ?, ?)""",
            (profile_id, company, vat, max_users, now, now),
        )

        # Associate users
        for user_id, email, is_master in found_users:
            c.execute(
                "UPDATE users SET billing_profile_id = ?, is_billing_master = ? WHERE id = ?",
                (profile_id, 1 if is_master else 0, user_id),
            )

        master_name = master[1] if master else "N/A"
        print(f"  OK {company} (P.IVA {vat}) - {len(found_users)} utenti, master: {master_name}")

    conn.commit()
    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
