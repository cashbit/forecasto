# MCP Strategy – TechMakers

## 1. Contesto e visione

Anthropic sta spingendo con decisione verso un ecosistema di AI agentici in cui il **Model Context Protocol (MCP)** è lo standard universale per collegare i modelli AI ai software esistenti. La direzione è chiara: ogni applicativo aziendale sarà accessibile agli agenti AI tramite un server MCP dedicato, esattamente come oggi i browser accedono ai siti web tramite HTTP.

**Implicazione per TechMakers:** ogni software che sviluppiamo o integriamo deve essere progettato con un server MCP come interfaccia naturale verso il mondo AI. Questo non è un add-on opzionale: è l'architettura del futuro prossimo.

---

## 2. Problemi dell'approccio attuale

L'attuale implementazione di TMMCP e TMMCP_ADMIN presenta le seguenti criticità:

- Un singolo server MCP espone una quantità eccessiva di tool eterogenei, rendendo poco chiaro all'utente cosa sta usando.
- Esistono credenziali MCP separate da gestire, disgiunte dalle credenziali applicative.
- Alcuni utenti Claude sono pre-autenticati automaticamente, in violazione del principio GDPR by design.
- L'amministratore dell'organizzazione deve conoscere dati sensibili degli utenti a priori.
- La gestione è accentrata e non scalabile.

---

## 3. Principi di progettazione (Requisiti)

I seguenti principi devono essere rispettati nella progettazione di qualsiasi server MCP, a partire da questo momento.

### 3.1 Un URL per applicativo
Per ogni applicativo esiste **un solo endpoint MCP**. Non esistono URL diversi per ambienti, ruoli o tenant: eventuali differenziazioni sono gestite internamente dal server MCP tramite autenticazione.

### 3.2 Semplicità per l'amministratore dell'organizzazione
L'amministratore della piattaforma Claude (es. Team o Enterprise) deve conoscere **esclusivamente l'URL MCP**. Nessuna credenziale aggiuntiva, nessuna configurazione utente-per-utente. L'URL viene inserito una volta nella piattaforma Claude tramite *Settings → Connectors*.

### 3.3 APIKEY solo a livello applicativo, non utente
Se il server MCP richiede una chiave di autenticazione per identificare **l'applicativo client** (es. Claude come piattaforma), questa è una chiave di sistema passata nell'URL o nell'header di configurazione. Non è una credenziale per-utente e non deve essere distribuita agli utenti finali.

### 3.4 GDPR by design
L'amministratore non deve mai gestire dati personali degli utenti per attivare un connettore MCP. L'autenticazione utente avviene in autonomia, direttamente tra l'utente e l'applicativo. Questo soddisfa il principio di minimizzazione del dato previsto dal GDPR.

### 3.5 Nessuna credenziale MCP dedicata
**Non esistono username e password MCP.** L'utente si autentica al server MCP con le stesse credenziali che già utilizza nell'applicativo (es. Forecasto, Mago, ecc.), tipicamente tramite **OAuth 2.0**. Claude supporta nativamente OAuth per i server MCP remoti: l'utente si autentica una sola volta e Claude gestisce il token e il suo rinnovo.

### 3.6 Disponibile per tutti, attivo per scelta
Una volta che l'URL è registrato nella piattaforma Claude, il connettore è **visibile ma non attivo** per tutti gli utenti dell'organizzazione. Ogni utente lo attiva autonomamente autenticandosi tramite il flusso OAuth predisposto. Nessuna attivazione automatica.

### 3.7 Stessa autenticazione dell'applicativo
Il flusso di autenticazione MCP reindirizza l'utente al login dell'applicativo sottostante. Una volta autenticato, il server MCP riceve un token OAuth che rappresenta l'utente con i suoi permessi applicativi. **Non esistono permessi MCP separati**: i permessi sono quelli già gestiti dall'applicativo.

### 3.8 Un server MCP per dominio funzionale
I server MCP vanno **suddivisi per applicativo o dominio funzionale**, non raggruppati in un monolite. L'utente deve vedere chiaramente a cosa si sta connettendo. Esempio:

| Server MCP | Applicativo esposto |
|---|---|
| `forecasto.techmakers.io/mcp` | Forecasto – Cash Flow |
| `mago.cliente.it/mcp` | Mago ERP |
| `iot-gateway.cliente.it/mcp` | Gateway IoT |

La granularità dei permessi sui singoli tool è gestita dall'applicativo in base all'identità dell'utente autenticato.

### 3.9 Nessuna pre-autenticazione automatica
Nessun utente Claude viene autenticato automaticamente su un server MCP. Il requisito di consenso esplicito è sia un obbligo GDPR che una best practice di sicurezza.

---

## 4. Ciclo di vita di un server MCP

### Fase 1 – Applicativo esistente
L'applicativo espone le proprie funzionalità tramite API (HTTP/REST o altro). Include già la gestione di autenticazione e autorizzazione per i propri utenti.

### Fase 2 – Sviluppo del server MCP
Il server MCP viene sviluppato come **adapter** tra il protocollo MCP e le API dell'applicativo. Responsabilità del server MCP:
- Esporre i tool MCP corrispondenti alle funzioni applicative.
- Implementare il flusso OAuth 2.0 delegando l'autenticazione all'applicativo.
- Trasformare il token OAuth ricevuto in un'identità applicativa per ogni chiamata.
- Non duplicare la logica di autorizzazione: questa rimane nell'applicativo.

### Fase 3 – Infrastruttura e raggiungibilità
- **Cloud / IP pubblico:** il server MCP è raggiungibile direttamente tramite HTTPS.
- **On-premise / cliente:** si attiva un tunnel **NGROK** (o equivalente) per esporre il server su un URL pubblico. Questo evita la gestione di infrastruttura server aggiuntiva da parte di TechMakers.

In entrambi i casi il risultato è un **URL HTTPS stabile e raggiungibile**.

### Fase 4 – Consegna all'organizzazione cliente
Il developer che ha sviluppato il server consegna al referente tecnico del cliente:
- L'URL del server MCP.
- (Opzionale) Una API Key di sistema, se il server richiede l'identificazione del client MCP, da inserire come parametro nell'URL o come header nella configurazione della piattaforma.

Nient'altro.

### Fase 5 – Registrazione in piattaforma Claude
Il referente tecnico del cliente accede a *Claude → Settings → Connectors* e aggiunge il server MCP fornendo l'URL. In ambienti Team/Enterprise questa operazione è riservata agli Owner o Admin dell'organizzazione.

### Fase 6 – Autenticazione utente (self-service)
Ogni utente che vuole utilizzare il connettore:
1. Accede alle proprie impostazioni Claude.
2. Trova il connettore disponibile per l'organizzazione.
3. Clicca su "Connect" e viene reindirizzato al login dell'applicativo.
4. Effettua il login con le proprie credenziali applicative (es. quelle di Forecasto).
5. Autorizza l'accesso → Claude riceve e gestisce il token OAuth.

Da questo momento il connettore è attivo per quell'utente. Claude rinnova il token automaticamente.

---

## 5. Standard tecnici di riferimento

| Aspetto | Standard adottato |
|---|---|
| Protocollo di trasporto | HTTP (Streamable HTTP) – lo standard consigliato da Anthropic per server remoti |
| Autenticazione | OAuth 2.0 (Authorization Code Flow) |
| Formato server | MCP SDK ufficiale (TypeScript o Python) |
| Esposizione on-premise | NGROK o tunnel equivalente |
| Granularità tool | Un server per dominio applicativo |

> **Nota:** Il trasporto SSE (Server-Sent Events) è considerato deprecato da Anthropic. I nuovi server MCP devono utilizzare Streamable HTTP.

---

## 6. Revisione dell'esistente

### TMMCP e TMMCP_ADMIN
Vanno **ristrutturati** secondo i principi di questo documento:

1. **Suddivisione per dominio:** i tool attuali vanno separati in server MCP distinti per applicativo (Forecasto, SQL Server, Route Assistant, ecc.).
2. **Rimozione delle credenziali MCP:** il sistema di username/password MCP viene eliminato. L'autenticazione avviene tramite OAuth 2.0 delegata all'applicativo.
3. **Rimozione della pre-autenticazione automatica:** nessun utente viene connesso automaticamente.
4. **Eliminazione di TMMCP_ADMIN** come entità separata: le funzioni amministrative rimangono nell'applicativo con i permessi gestiti dall'applicativo stesso.

### Forecasto MCP (nuovo modello di riferimento)
La nuova versione di Forecasto, con sistema di permessi differenziati nativi nell'applicativo, diventa il **template architetturale** per tutti i server MCP TechMakers:

- Autenticazione: OAuth 2.0 con credenziali Forecasto.
- Autorizzazione tool: determinata dal ruolo utente in Forecasto (admin, viewer, ecc.).
- Nessuna logica di permesso nel layer MCP.

---

## 7. Note per dominio applicativo

### SQL Server MCP
Per i connettori che espongono database SQL Server, le **credenziali applicative sono le credenziali SQL stesse**. Non si introducono layer di autenticazione aggiuntivi: l'utente si autentica al server MCP con username e password SQL, e queste vengono utilizzate per aprire la connessione al database.

Questo approccio è corretto per i seguenti motivi:

- Le utenze SQL definiscono già a quali database e schemi l'utente può accedere.
- I permessi SQL (SELECT, INSERT, UPDATE, DELETE, EXECUTE, ecc.) definiscono il tipo di operazioni consentite, svolgendo il ruolo di autorizzazione granulare senza necessità di logica aggiuntiva nel layer MCP.
- Il DBA mantiene il controllo completo tramite gli strumenti SQL standard, senza dover gestire una configurazione MCP parallela.

Il server MCP SQL si limita a: ricevere le credenziali dall'utente, aprire la connessione con quelle credenziali ed eseguire le query nel contesto dei permessi SQL dell'utente. Eventuali operazioni non consentite vengono rifiutate direttamente dal database.

---

## 8. Roadmap

### Fase 0 – Censimento (prerequisito)
Prima di qualsiasi intervento è necessario produrre un elenco completo di:
- Utenti attualmente operativi su TMMCP e TMMCP_ADMIN.
- Tool utilizzati per ciascun utente.
- Applicativi sottostanti (Forecasto, SQL Server, Route Assistant, ecc.).

Questo censimento determina la sequenza delle fasi successive e i soggetti da notificare prima di ogni intervento.

### Fase 1 – Forecasto MCP (template architetturale)
Sviluppo e messa in produzione del nuovo server MCP Forecasto con autenticazione OAuth 2.0 nativa. Questo server diventa il **template di riferimento** per tutti i server MCP successivi.

- Definire il flusso OAuth 2.0 delegato all'autenticazione Forecasto.
- Testare il flusso di connessione self-service lato utente Claude.
- Validare che i permessi utente Forecasto si riflettano correttamente sui tool esposti.

### Fase 2 – Sviluppo server MCP per dominio
Sviluppo dei server MCP separati per ciascun dominio applicativo identificato nel censimento. Ogni server implementa il modello definito in Fase 1 adattato al proprio applicativo (SQL Server con credenziali SQL, Route Assistant, ecc.).

### Fase 3 – Migrazione degli utenti esistenti
Operazione critica: gli utenti attualmente operativi su TMMCP devono essere migrati sui nuovi server senza interruzione di servizio.

Procedura per ogni utente:

1. **Notifica preventiva:** comunicare all'utente la data di migrazione, il nome del nuovo connettore e le istruzioni di autenticazione self-service.
2. **Periodo di coesistenza:** i vecchi server TMMCP rimangono attivi in parallelo per un periodo definito (consigliato: 30 giorni), consentendo all'utente di effettuare la migrazione in autonomia.
3. **Autenticazione sul nuovo server:** l'utente accede alle impostazioni Claude, trova il nuovo connettore e completa l'autenticazione con le proprie credenziali applicative.
4. **Verifica operatività:** l'utente conferma che i tool necessari sono accessibili e funzionanti sul nuovo server.
5. **Disattivazione vecchio accesso:** una volta confermata la migrazione, l'utente viene rimosso dal vecchio server TMMCP.

### Fase 4 – Dismissione TMMCP e TMMCP_ADMIN
Una volta completata la migrazione di tutti gli utenti censiti:

- Disattivazione dei server TMMCP e TMMCP_ADMIN.
- Rimozione delle configurazioni dai workspace Claude delle organizzazioni clienti (con supporto ai referenti tecnici se necessario).
- Archiviazione del codice con documentazione della dismissione.

### Fase 5 – Consolidamento e documentazione
- Pubblicazione del boilerplate TechMakers per lo sviluppo di nuovi server MCP.
- Documentazione del processo di onboarding cliente (dall'URL MCP all'utente operativo).
- Valutazione della submission dei server MCP al directory pubblico di Claude per visibilità commerciale.

---

*Documento interno TechMakers – Versione 1.1*
