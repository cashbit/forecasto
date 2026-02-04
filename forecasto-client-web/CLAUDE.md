# Regole di Sviluppo per Claude

## UI e API

1. **Allineamento UI-Server**: Quando crei o modifichi una UI, verifica sempre che:
   - I campi del form corrispondano esattamente ai campi dello schema server (RecordCreate, RecordUpdate, etc.)
   - I tipi di dati siano compatibili (stringhe, numeri, date)
   - I campi obbligatori siano validati sia lato client che server
   - I nuovi campi siano aggiunti in tutti i livelli: model, schema, service, API, types client, form, detail view

## Gestione Errori

2. **Errori Server**:
   - Gestire tutti i formati di errore FastAPI (422 validation, 500 internal, 400 bad request)
   - Estrarre il messaggio leggibile da `error`, `message`, o `detail`
   - Per errori 422, formattare l'array di errori in modo leggibile

3. **Errori Client**:
   - Mostrare sempre toast con messaggi chiari all'utente
   - Validare i prerequisiti prima di chiamare l'API (es: sessione attiva)
   - Non lasciare mai errori generici tipo "Errore durante l'operazione"

## User Experience

4. **Messaggi Chiari**: L'utente deve sempre capire:
   - Cosa è andato storto
   - Cosa deve fare per risolvere (es: "Devi avere una sessione attiva per modificare i record")
   - Quali campi sono obbligatori e perché

5. **Prerequisiti Espliciti**:
   - Se un'operazione richiede prerequisiti (sessione attiva, workspace selezionato), comunicarlo PRIMA che l'utente tenti l'azione
   - Disabilitare i pulsanti quando i prerequisiti non sono soddisfatti
   - Mostrare tooltip o messaggi che spiegano perché un'azione non è disponibile

## Checklist Nuovo Campo

Quando aggiungi un nuovo campo:
- [ ] Model SQLAlchemy (server)
- [ ] Schema Pydantic Create/Update/Response (server)
- [ ] Service (passare il campo al costruttore e al snapshot)
- [ ] Types TypeScript (client)
- [ ] Form (schema zod, defaultValues, UI)
- [ ] Detail view
- [ ] Grid/lista (se necessario)
- [ ] Reset database se cambiano le colonne
