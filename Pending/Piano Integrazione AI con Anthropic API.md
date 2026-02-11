Il piano e' salvato nel file:                                                                                         
   
  /Users/cashbit/.claude/plans/fancy-snuggling-fog.md                                                                   
                                                                                               
  Per richiamarlo in una prossima sessione, hai diverse opzioni:                                                        
                                                                                                                      
  1. Chiedi direttamente: "Leggi il piano in /Users/cashbit/.claude/plans/fancy-snuggling-fog.md e implementalo"
  2. Riferimento rapido: "Implementa il piano AI di Forecasto dal file plans/fancy-snuggling-fog.md"
  3. Fase per fase: "Leggi il piano in .claude/plans/fancy-snuggling-fog.md e inizia dalla Fase 1"

  Il file restera li finche non lo cancelli. Contiene tutto: contesto, architettura, file da creare/modificare, ordine
  di implementazione e verifiche.



# Piano: Integrazione AI con Anthropic API                                                      

 Contesto

 Forecasto necessita di funzionalita AI per: (1) acquisizione documenti PDF automatica, (2) tagging automatico delle
 transazioni, (3) chat in linguaggio naturale per CRUD, analisi e previsioni cashflow. L'API Anthropic viene invocata
 server-side con chiave API per-workspace salvata in workspace.settings.anthropic_api_key.

 ---
 Fase 1: Fondamenta (AI Service + Settings UI)

 Server

 Nuova dipendenza in forecasto-server/pyproject.toml:
 "anthropic>=0.40.0"

 Nuovo file forecasto-server/src/forecasto/services/ai_service.py:
 - Classe AIService(db: AsyncSession) — segue pattern esistente di RecordService
 - Metodo get_client(workspace_id) → anthropic.AsyncAnthropic con cache per richiesta
 - Legge workspace.settings["anthropic_api_key"], errore italiano se mancante
 - Metodo validate_api_key(key) per test chiave

 Nuovo file forecasto-server/src/forecasto/schemas/ai.py:
 - ChatRequest(message, history, allowed_actions)
 - ClassifyRequest(record_ids)
 - TagNotifyRequest(record_id)
 - PdfExtractResult(fields...)

 Nuovo file forecasto-server/src/forecasto/api/ai.py — router con tutti gli endpoint AI

 Modifica forecasto-server/src/forecasto/main.py:
 - Registrare ai.router con prefix /api/v1/workspaces

 Sicurezza API key: filtrare anthropic_api_key dal JSON settings nelle risposte workspace. Esporre solo un booleano
 has_anthropic_api_key nel serializzare WorkspaceResponse/WorkspaceWithRole.

 Client

 Nuovo file forecasto-client-web/src/components/ai/ApiKeySetup.tsx:
 - Card con input password (show/hide), pulsante "Verifica", stato configurato/non configurato
 - Salva via updateWorkspace({ settings: { ...current, anthropic_api_key: key } })

 Modifica forecasto-client-web/src/pages/SettingsPage.tsx:
 - Aggiungere tab "AI" (icona Brain da lucide-react) con ApiKeySetup

 Modifica forecasto-client-web/src/types/workspace.ts:
 - Aggiungere anthropic_api_key?: string e has_anthropic_api_key?: boolean a WorkspaceSettings

 ---
 Fase 2: Acquisizione Documenti PDF

 Server

 Nuovo file forecasto-server/src/forecasto/services/pdf_service.py:
 - Classe PdfService(client: AsyncAnthropic)
 - extract_from_pdf(pdf_bytes, workspace_settings) → dict compatibile RecordCreate
 - Invia PDF come blocco document base64 (API Claude supporta PDF nativamente, no pdf2image)
 - System prompt in italiano: estrai tipo documento, importi, date, controparte, note dettagliate
 - Risposta JSON strutturata con gestione rate (installments)
 - Modello: claude-sonnet-4-20250514

 Endpoint POST /{workspace_id}/ai/pdf-extract in api/ai.py:
 - Accetta UploadFile + area (Form)
 - Ritorna dati estratti + confidence (high/medium/low) + testo grezzo

 Client

 Nuovo file forecasto-client-web/src/api/ai.ts:
 - extractPdf(workspaceId, file, area) — multipart upload
 - classifyRecords(workspaceId, recordIds) — classificazione manuale
 - notifyRecordChanged(workspaceId, recordId) — trigger tagging
 - getChatStreamUrl(workspaceId) — URL per SSE chat

 Nuovo file forecasto-client-web/src/types/ai.ts:
 - PdfExtractResult, ChatSSEEvent, ActionPermission, ChatState, tipi chat message

 Nuovo file forecasto-client-web/src/components/ai/PdfUploadDialog.tsx:
 - Drop zone per PDF, selettore area (budget/prospect/orders/actual)
 - Pulsante "Analizza" → chiama endpoint, mostra loading
 - Preview dati estratti in form editabile (riutilizza pattern RecordForm)
 - Indicatore confidence (verde/giallo/rosso)
 - Se rilevate rate → opzione di creare record multipli (pattern SdiImportDialog)
 - Pulsante "Crea Record" → recordsApi.create() + trigger auto-tagging

 Modifica forecasto-client-web/src/components/layout/Header.tsx:
 - Aggiungere pulsante "Importa PDF" (icona FileText da lucide-react) accanto ai pulsanti import esistenti (riga
 228-276)
 - Stato showPdfUploadDialog, stesso pattern di SdiImportDialog

 ---
 Fase 3: Tagging Automatico

 Server

 Nuovo file forecasto-server/src/forecasto/services/tagging_service.py:
 - Registry module-level _pending_tasks: dict[tuple[str,str], asyncio.Task]
 - schedule_classification(workspace_id, record_id): cancella task precedente, crea nuovo asyncio.Task che dorme 60s
 poi classifica
 - _classify_record(db, workspace_id, record_id): nuova sessione DB, prompt a Claude Haiku con dati record → JSON
 {category, subcategory, tags}
 - Categorie macro: COSTI GENERALI, AFFITTI, CANONI, INFRASTRUTTURA, PERSONALE, CONSULENZE, TASSE E CONTRIBUTI, UTENZE,
  MARKETING, VENDITE, RICAVI SERVIZI, RICAVI PRODOTTI, INVESTIMENTI, FINANZIAMENTI, ALTRO
 - Settori: connettivita, automezzi, viaggi, consulenze, software, hardware, hosting, telefonia, etc.
 - classify_records_batch(client, db, records) per ri-classificazione manuale
 - Modello: claude-haiku-3-5-20241022 (veloce ed economico per classificazione)
 - Preserva classification.source_file esistente

 Endpoint POST /{workspace_id}/ai/tag-notify: registra record per classificazione debounced, ritorna subito
 Endpoint POST /{workspace_id}/ai/classify: classificazione manuale batch per record_ids

 Client

 Modifica forecasto-client-web/src/hooks/useRecords.ts:
 - In createMutation.onSuccess e updateMutation.onSuccess: chiamare aiApi.notifyRecordChanged() fire-and-forget
 (.catch(() => {}))
 - Solo se workspace ha has_anthropic_api_key

 Nuovo file forecasto-client-web/src/components/ai/ClassificationBadge.tsx:
 - Componente Badge per mostrare classification.category e classification.tags
 - Colori distinti per macro-categoria

 Modifica forecasto-client-web/src/components/records/RecordDetail.tsx:
 - Aggiungere ClassificationBadge dopo la sezione "Prossima Azione" (riga ~60)
 - Pulsante "Riclassifica" per trigger manuale

 ---
 Fase 4: Chat AI in Linguaggio Naturale

 Server

 Nuovo file forecasto-server/src/forecasto/services/chat_service.py:
 - Classe ChatService(db, client, workspace_id)
 - Tool definitions per tool_use di Claude:
   - search_records — cerca record con filtri (text, area, sign, date range)
   - create_record — crea record (via RecordService)
   - update_record — aggiorna record (via RecordService)
   - delete_record — soft delete (via RecordService)
   - calculate_cashflow — proiezione cashflow (via CashflowService)
   - aggregate_by_account — totali raggruppati per conto
   - what_if_scenario — simulazione: aggiunge/rimuove record virtuali, ricalcola cashflow
 - stream_chat(messages, allowed_actions, user_id) → AsyncGenerator[dict] con eventi SSE
 - execute_tool(tool_name, tool_input, user_id) → esegue tool e ritorna risultato
 - System prompt costruito dinamicamente: conteggio record per area, top 10 account, regole operative
 - Modello: claude-sonnet-4-20250514

 Endpoint POST /{workspace_id}/ai/chat in api/ai.py:
 - Ritorna StreamingResponse con media_type="text/event-stream"
 - Eventi SSE: text_delta, tool_use_request, tool_result, done, error

 Client

 Nuovo file forecasto-client-web/src/stores/chatStore.ts:
 - Stato: messages, isStreaming, currentStreamText, actionPermissions, pendingToolUse
 - actionPermissions: Record<string, 'ask' | 'always_allow' | 'deny'> — persistito in localStorage
 - Metodi: addMessage, setStreaming, appendStreamText, setPendingToolUse, setActionPermission, clearMessages

 Nuovo file forecasto-client-web/src/hooks/useChat.ts:
 - Hook per gestire streaming SSE con fetch + ReadableStream (non EventSource, serve POST con Authorization header)
 - sendMessage(content): invia messaggio, legge stream, gestisce tool_use
 - Logica conferma: se actionPermissions[toolName] === 'always_allow' → auto-approva; altrimenti → mostra conferma
 - Dopo tool CRUD → invalida query TanStack

 Nuovo file forecasto-client-web/src/components/chat/ChatToolConfirmation.tsx:
 - Descrizione azione proposta in italiano
 - Tre pulsanti: "Consenti" (primary), "Consenti sempre" (outline), "Annulla" (ghost)
 - "Consenti sempre" salva permesso in chatStore per quel tool_name

 Nuovo file forecasto-client-web/src/components/chat/ChatPanel.tsx:
 - Pannello completo: lista messaggi scrollabile + tool confirmation inline + input textarea
 - Empty state con suggerimenti: "Quali sono le spese maggiori?", "Crea una fattura di...", "Previsione cashflow
 prossimi 3 mesi"

 Modifica forecasto-client-web/src/components/chat/ChatArea.tsx:
 - Riscrivere per integrare chatStore, streaming live, gestione tool_use

 Modifica forecasto-client-web/src/components/chat/ChatMessage.tsx:
 - Supporto rendering tool_use (badge con nome tool + input), risultati tool, markdown
 - Differenziare visivamente messaggi di sistema/tool

 Modifica forecasto-client-web/src/pages/DashboardPage.tsx:
 - Aggiungere ChatPanel come alternativa al pannello destro
 - Toggle chat/details nel pannello destro (pulsante nell'header del pannello)
 - Quando rightPanelContent === 'chat' → mostra ChatPanel

 Modifica forecasto-client-web/src/components/layout/Header.tsx:
 - Aggiungere pulsante toggle chat (icona MessageSquare) nella toolbar

 ---
 Riepilogo File

 Nuovi file (server — 5)
 ┌─────────────────────────────┬───────────────────────────────────────┐
 │            File             │              Descrizione              │
 ├─────────────────────────────┼───────────────────────────────────────┤
 │ services/ai_service.py      │ Client Anthropic per-workspace        │
 ├─────────────────────────────┼───────────────────────────────────────┤
 │ services/pdf_service.py     │ Estrazione dati da PDF via Vision     │
 ├─────────────────────────────┼───────────────────────────────────────┤
 │ services/tagging_service.py │ Classificazione debounced con asyncio │
 ├─────────────────────────────┼───────────────────────────────────────┤
 │ services/chat_service.py    │ Chat con tool_use e streaming         │
 ├─────────────────────────────┼───────────────────────────────────────┤
 │ api/ai.py + schemas/ai.py   │ Endpoint e schemi Pydantic            │
 └─────────────────────────────┴───────────────────────────────────────┘
 Nuovi file (client — 8)
 ┌──────────────────────────────────────────┬──────────────────────────────┐
 │                   File                   │         Descrizione          │
 ├──────────────────────────────────────────┼──────────────────────────────┤
 │ api/ai.ts                                │ API client per endpoint AI   │
 ├──────────────────────────────────────────┼──────────────────────────────┤
 │ types/ai.ts                              │ Tipi TypeScript per AI       │
 ├──────────────────────────────────────────┼──────────────────────────────┤
 │ stores/chatStore.ts                      │ Stato chat + permessi azioni │
 ├──────────────────────────────────────────┼──────────────────────────────┤
 │ hooks/useChat.ts                         │ Hook streaming SSE           │
 ├──────────────────────────────────────────┼──────────────────────────────┤
 │ components/ai/PdfUploadDialog.tsx        │ Upload e anteprima PDF       │
 ├──────────────────────────────────────────┼──────────────────────────────┤
 │ components/ai/ClassificationBadge.tsx    │ Badge classificazione        │
 ├──────────────────────────────────────────┼──────────────────────────────┤
 │ components/ai/ApiKeySetup.tsx            │ Configurazione API key       │
 ├──────────────────────────────────────────┼──────────────────────────────┤
 │ components/chat/ChatToolConfirmation.tsx │ UI conferma azioni           │
 ├──────────────────────────────────────────┼──────────────────────────────┤
 │ components/chat/ChatPanel.tsx            │ Pannello chat completo       │
 └──────────────────────────────────────────┴──────────────────────────────┘
 File da modificare (8)
 ┌──────────────────────────────────────────────────────────────┬───────────────────────────────────────────┐
 │                             File                             │                 Modifica                  │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-server/pyproject.toml                              │ +anthropic>=0.40.0                        │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-server/src/forecasto/main.py                       │ +registrazione ai.router                  │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-client-web/src/types/workspace.ts                  │ +anthropic_api_key, has_anthropic_api_key │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-client-web/src/pages/SettingsPage.tsx              │ +tab "AI"                                 │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-client-web/src/components/layout/Header.tsx        │ +pulsanti PDF import e chat toggle        │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-client-web/src/pages/DashboardPage.tsx             │ +ChatPanel nel pannello destro            │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-client-web/src/hooks/useRecords.ts                 │ +trigger auto-tagging in onSuccess        │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-client-web/src/components/records/RecordDetail.tsx │ +ClassificationBadge                      │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-client-web/src/components/chat/ChatArea.tsx        │ Riscrittura con streaming                 │
 ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
 │ forecasto-client-web/src/components/chat/ChatMessage.tsx     │ +tool_use rendering                       │
 └──────────────────────────────────────────────────────────────┴───────────────────────────────────────────┘
 Nessuna migrazione DB necessaria

 Il campo classification (JSON) esiste gia su Record. La API key va in workspace.settings (JSON flessibile).

 ---
 Ordine di Implementazione

 1. Fase 1: AI Service + API key settings (fondamenta per tutto)
 2. Fase 2: PDF upload (indipendente, valore immediato)
 3. Fase 3: Tagging automatico (usa AI Service, arricchisce dati)
 4. Fase 4: Chat (la piu complessa, beneficia delle fasi precedenti)

 ---
 Verifica

 1. Settings: Configurare API key → verificare → salvare → ricaricare pagina → key presente
 2. PDF: Upload fattura PDF → dati estratti corretti → creare record → verificare note dettagliate
 3. Tagging: Creare record → attendere 60s → classification populata con category e tags
 4. Chat: "Quali sono le spese di questo mese?" → search_records eseguito → risposta coerente
 5. Chat CRUD: "Crea un record di 1000 EUR per consulenza" → conferma → record creato
 6. Chat what-if: "Cosa succede al cashflow se aggiungo una spesa di 50000 a marzo?" → simulazione
 7. TypeScript: cd forecasto-client-web && npx tsc --noEmit senza errori