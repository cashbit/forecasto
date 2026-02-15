# Prompt: GDPR Compliance — Verifica e Implementazione per Forecasto

Sei un esperto di sicurezza e GDPR. Devi verificare e rendere conforme al GDPR l'applicazione **Forecasto**, un software SaaS di previsione finanziaria e gestione cashflow con architettura:

- **Backend:** Python / FastAPI / SQLAlchemy (async) / SQLite
- **Frontend:** React / TypeScript / Vite / Zustand / Tailwind / Shadcn UI
- **Auth:** JWT (access token 24h + refresh token 30gg) con bcrypt per password

Il progetto è nella directory corrente con struttura:
- `forecasto-server/` — backend
- `forecasto-client-web/` — frontend

---

## REQUISITI GDPR DA IMPLEMENTARE

Lavora in ordine di priorità. Per ogni requisito: verifica lo stato attuale nel codice, proponi la modifica, chiedi conferma prima di implementare.

### TIER 1 — CRITICI (bloccanti per produzione)

#### 1.1 Cifratura IBAN e BIC a riposo
- **Dove:** `forecasto-server/src/forecasto/models/bank_account.py`
- **Problema:** I campi `iban` (String 34) e `bic_swift` (String 11) sono salvati in chiaro
- **Requisito:** Cifrare con AES-256 (Fernet) at rest. I campi nel DB devono contenere solo dati cifrati. La chiave di cifratura deve essere in variabile d'ambiente (`ENCRYPTION_KEY`), non nel codice
- **Impatto:** Modificare model, schema di risposta (decifrare solo in output), migration Alembic per migrare dati esistenti
- **Articolo GDPR:** Art. 32 (sicurezza del trattamento)

#### 1.2 Diritto alla cancellazione (Right to Erasure)
- **Dove:** Nuovo endpoint `DELETE /api/users/me` + nuovo service method
- **Problema:** Non esiste modo per l'utente di cancellare il proprio account e tutti i dati personali
- **Requisito:** Implementare endpoint che:
  1. Anonimizza l'utente: email → `deleted-{uuid}@redacted.local`, name → `Deleted User`, svuota notification_preferences
  2. Revoca tutti i refresh token dell'utente
  3. Rimuove l'utente da tutti i workspace dove è member (non owner)
  4. Per i workspace dove è owner: se è l'unico membro, elimina il workspace; se ci sono altri membri, trasferisci ownership al primo admin o blocca l'operazione chiedendo di trasferire prima
  5. Anonimizza user_id negli audit log (sostituisci con "deleted-user")
  6. Elimina i record di SessionMessage dell'utente
  7. Mantieni i record finanziari (sono dati del workspace, non dell'utente) ma anonimizza created_by e updated_by
- **Articolo GDPR:** Art. 17

#### 1.3 Diritto alla portabilità dei dati (Data Export)
- **Dove:** Nuovo endpoint `GET /api/users/me/export`
- **Problema:** Non esiste modo per l'utente di esportare tutti i propri dati personali
- **Requisito:** Endpoint che restituisce un JSON con:
  1. Dati profilo (email, nome, date, preferenze)
  2. Lista workspace di appartenenza con ruoli
  3. Audit log dell'utente (le proprie azioni)
  4. Sessioni di lavoro dell'utente
  5. Record creati/modificati dall'utente (con riferimento al workspace)
  6. Timestamp dell'export
- **Formato:** JSON scaricabile, con Content-Disposition header
- **Articolo GDPR:** Art. 20

#### 1.4 Restrizione CORS e strategia accesso multi-canale
- **Dove:** `forecasto-server/src/forecasto/main.py`, middleware, config
- **Problema:** `allow_origins=["*"]` con `allow_credentials=True` permette a qualsiasi sito di fare richieste autenticate
- **Contesto:** Le API devono essere accessibili da tre canali:
  1. **Webapp browser** — soggetta a CORS (preflight del browser)
  2. **App mobile native (iOS/Android)** — NON soggette a CORS (richieste HTTP dirette)
  3. **Sistemi terzi server-to-server (gestionali, CRM)** — NON soggetti a CORS
- **Requisito:**
  1. **CORS (solo browser):** Leggere le origini consentite da variabile d'ambiente `CORS_ORIGINS` (comma-separated). Default sviluppo: `http://localhost:5173,http://localhost:3000`. In produzione: solo il dominio della webapp. Restringere `allow_methods` a `GET,POST,PUT,PATCH,DELETE,OPTIONS` e `allow_headers` a `Content-Type,Authorization,X-Session-Id`
  2. **App mobile:** Nessuna modifica CORS necessaria — le app native non inviano header `Origin` e non sono soggette a preflight. Si autenticano con lo stesso JWT della webapp (endpoint `POST /api/auth/login` + refresh token). Nessun intervento richiesto.
  3. **Integrazioni terze (server-to-server):** Usare il modello `ApiKey` già presente nel codice. Verificare che gli endpoint di gestione API key siano completi:
     - `POST /api/workspaces/{id}/api-keys` — crea chiave (owner/admin)
     - `GET /api/workspaces/{id}/api-keys` — lista chiavi (owner/admin)
     - `DELETE /api/workspaces/{id}/api-keys/{key_id}` — revoca chiave
     - Autenticazione: header `X-API-Key` in alternativa a `Authorization: Bearer`. Il middleware deve riconoscere entrambi i metodi e risolvere il workspace dalla chiave.
     - Le API key devono rispettare i permessi configurati (read/write) e le area_permissions del workspace.
     - Aggiornare `last_used_at` ad ogni utilizzo della chiave.
  4. **Documentazione:** Aggiungere in config un flag `ENVIRONMENT` (`development`|`production`) che attiva automaticamente la CORS policy appropriata. In development: origini localhost. In production: solo `CORS_ORIGINS`.
- **Nota importante:** NON aprire CORS per far passare mobile o integrazioni server-to-server. CORS è esclusivamente una protezione browser. Mobile e server-to-server funzionano già senza modifiche CORS.
- **Articolo GDPR:** Art. 32

---

### TIER 2 — IMPORTANTI (necessari per compliance)

#### 2.1 Consenso e Privacy Policy
- **Dove:** Nuovo model `ConsentRecord` + modifica flusso di registrazione
- **Problema:** Nessun meccanismo di raccolta consenso esplicito alla registrazione
- **Requisito:**
  1. Nuovo model `ConsentRecord` con: user_id, consent_type (privacy_policy, terms_of_service), version, accepted_at, ip_address
  2. Modificare `POST /api/users/register` per richiedere `privacy_accepted: true` e `terms_accepted: true`
  3. Salvare il record di consenso al momento della registrazione
  4. Nuovo endpoint `GET /api/legal/consents` per l'utente per vedere i propri consensi
  5. Endpoint `GET /api/legal/privacy-policy` che restituisce la versione corrente della privacy policy (testo configurabile)
- **Articolo GDPR:** Art. 6, 7, 13

#### 2.2 Policy di retention e cleanup automatico
- **Dove:** Nuovo modulo `forecasto-server/src/forecasto/tasks/cleanup.py` + config
- **Problema:** Token scaduti, audit log, record soft-deleted e inviti scaduti restano nel DB indefinitamente
- **Requisito:**
  1. Aggiungere configurazione retention in `config.py`:
     - `audit_log_retention_days: int = 365`
     - `soft_delete_retention_days: int = 90`
     - `expired_token_cleanup_days: int = 7`
     - `expired_invitation_cleanup_days: int = 30`
  2. Creare task di cleanup che viene eseguito all'avvio dell'app (e poi periodicamente):
     - Elimina RefreshToken dove `expires_at < now - 7 giorni` O `revoked_at < now - 7 giorni`
     - Elimina EmailVerificationToken scaduti
     - Elimina AuditLog più vecchi di `audit_log_retention_days`
     - Elimina hard i Record con `deleted_at < now - soft_delete_retention_days`
     - Elimina Invitation scadute e non accettate oltre `expired_invitation_cleanup_days`
  3. Logga il numero di record eliminati per ogni categoria
- **Articolo GDPR:** Art. 5(e) (limitazione della conservazione)

#### 2.3 Minimizzazione dati nei log (IP e User-Agent)
- **Dove:** `models/audit.py`, `models/user.py` (RefreshToken), services che creano audit log
- **Problema:** IP address e User-Agent salvati a tempo indeterminato senza base giuridica chiara
- **Requisito:**
  1. Rendere opzionale il logging di IP e User-Agent tramite config: `log_ip_address: bool = False`, `log_user_agent: bool = False`
  2. Se abilitato, troncare l'IP (ultimo ottetto mascherato: `192.168.1.x`) per IPv4, ultimi 80 bit per IPv6
  3. Se abilitato, salvare solo la famiglia del browser dal User-Agent (es. "Chrome 120"), non la stringa completa
  4. Applicare la retention policy del punto 2.2 anche a questi campi
- **Articolo GDPR:** Art. 5(c) (minimizzazione dei dati), Art. 32

#### 2.4 Rate limiting sugli endpoint di autenticazione
- **Dove:** Middleware o dependency FastAPI
- **Problema:** Nessuna protezione brute force su login, registrazione, validazione codici
- **Requisito:**
  1. Implementare rate limiting basato su IP per:
     - `POST /api/auth/login` → max 5 tentativi / minuto per IP
     - `POST /api/users/register` → max 3 tentativi / minuto per IP
     - `POST /api/admin/registration-codes/validate` → max 10 tentativi / minuto per IP
  2. Usare un approccio in-memory (dict con TTL) per semplicità, o `slowapi` se preferisci una libreria
  3. Restituire HTTP 429 con header `Retry-After`
- **Articolo GDPR:** Art. 32 (misure tecniche adeguate)

---

### TIER 3 — MIGLIORAMENTI (best practice)

#### 3.1 Accesso dell'utente ai propri audit log
- **Dove:** Nuovo endpoint `GET /api/users/me/audit-log`
- **Problema:** L'utente non può vedere chi ha fatto cosa con i suoi dati
- **Requisito:** Endpoint paginato che restituisce gli audit log dove `user_id = current_user.id`, con filtri opzionali per data e azione
- **Articolo GDPR:** Art. 15 (diritto di accesso)

#### 3.2 Pulizia localStorage al logout (frontend)
- **Dove:** `forecasto-client-web/src/stores/authStore.ts` (o equivalente)
- **Problema:** Il metodo logout() resetta lo stato Zustand ma potrebbe non pulire localStorage/sessionStorage
- **Requisito:** Assicurarsi che `logout()` chiami esplicitamente `localStorage.removeItem()` per tutti i token e dati sensibili salvati nel browser
- **Articolo GDPR:** Art. 32

#### 3.3 Validazione campi testo libero per PII accidentali
- **Dove:** Schema di validazione per Record.owner, Record.note, Project.description
- **Problema:** Campi free-text possono contenere PII non intenzionali (codici fiscali, IBAN, numeri di telefono)
- **Requisito:** Aggiungere un warning (non un blocco) lato frontend se il testo inserito contiene pattern che assomigliano a dati sensibili (regex per CF italiano, IBAN, numeri di telefono). Il warning deve essere dismissabile dall'utente.
- **Articolo GDPR:** Art. 5(c)

#### 3.4 Rimozione credenziali admin hardcoded
- **Dove:** `forecasto-server/src/forecasto/main.py` — funzione `seed_default_admin()`
- **Problema:** Email e password admin hardcoded nel codice sorgente
- **Requisito:**
  1. Leggere email e password admin da variabili d'ambiente: `ADMIN_EMAIL`, `ADMIN_PASSWORD`
  2. Se le variabili non sono impostate, NON creare l'admin (logga un warning)
  3. Rimuovere il `print()` che stampa le credenziali in console
  4. Mantenere `must_change_password=True`
- **Articolo GDPR:** Art. 32

#### 3.5 Header di sicurezza HTTP
- **Dove:** Middleware FastAPI
- **Problema:** Nessun header di sicurezza impostato nelle risposte
- **Requisito:** Aggiungere middleware che imposta:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (solo se HTTPS)
  - `X-XSS-Protection: 0` (deprecato, ma per backward compatibility)
  - `Referrer-Policy: strict-origin-when-cross-origin`
- **Articolo GDPR:** Art. 32

#### 3.6 Notifica breach (preparazione)
- **Dove:** Nuovo template/procedura documentata
- **Problema:** Nessun meccanismo di notifica breach previsto
- **Requisito:** Creare un endpoint admin `POST /api/admin/breach-notification` che:
  1. Registra l'evento di breach con timestamp, descrizione, dati coinvolti
  2. Genera un report con la lista degli utenti potenzialmente impattati
  3. Prepara il template di notifica (non invia — è un draft per l'admin)
- **Articolo GDPR:** Art. 33, 34

---

## ISTRUZIONI OPERATIVE

1. **Analizza prima, implementa dopo:** Per ogni requisito, mostra prima lo stato attuale del codice e la modifica proposta. Chiedi conferma prima di procedere.
2. **Un requisito alla volta:** Non raggruppare le modifiche. Completa e testa un requisito prima di passare al successivo.
3. **Migration Alembic:** Per ogni modifica al DB, crea la migration Alembic corrispondente.
4. **Test:** Per ogni nuovo endpoint o modifica di logica, aggiungi i test in `tests/`.
5. **Config:** Ogni nuovo parametro deve andare in `config.py` con un default sensato e deve essere sovrascrivibile da variabile d'ambiente.
6. **Non rompere l'esistente:** Le modifiche devono essere backward-compatible. I dati esistenti devono funzionare anche dopo le migration.
7. **Lingua:** I messaggi di errore verso l'utente possono essere in italiano (coerente con l'app esistente). I commenti nel codice e i log in inglese.
