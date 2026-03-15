# Forecasto — Manuale Utente

---

## Introduzione

Forecasto è una piattaforma web per la **gestione previsionale della liquidità** aziendale. Permette di raccogliere in un unico sistema tutte le voci di entrata e uscita — dai budget di previsione alle fatture emesse — e di visualizzarne l'impatto sul cashflow nel tempo.

Il modello dati ruota attorno al concetto di **Voce**: un movimento finanziario caratterizzato da un importo, una data di incasso/pagamento prevista e uno stato. Le voci sono organizzate in quattro **Aree** che rispecchiano le fasi del ciclo finanziario aziendale e in **Workspace** che separano i dati per società, divisione o qualsiasi altra unità organizzativa.

### Concetti chiave

| Concetto | Descrizione |
|---|---|
| **Workspace** | Contenitore dei dati finanziari. Ogni workspace è indipendente e può avere più membri con ruoli e permessi diversi. |
| **Area** | Le quattro categorie di voci (Budget, Prospect, Ordini, Actual) che corrispondono alle fasi del ciclo finanziario. |
| **Voce (Record)** | Unità base: un movimento finanziario con conto, importo, data cashflow, IVA e stato. |
| **Stage** | Stato binario (0/1) di una voce il cui significato varia per area: es. non pagato/pagato, non consegnato/consegnato. |
| **Cashflow** | Proiezione temporale della liquidità, calcolata sommando le voci filtrate per area, stage e periodo. |
| **Revisione Zero** | Modalità che aiuta a tenere sotto controllo le voci in stage 0 che richiedono un'azione o una data di revisione. |

### Flusso di lavoro tipico

Il percorso naturale di una voce parte dal **Budget** — che può ospitare sia previsioni di spesa/ricavo pianificate sia opportunità commerciali ancora in fase iniziale — passa per **Prospect** (trattativa commerciale aperta), poi per **Ordini** (impegni confermati ma non ancora fatturati) e infine arriva ad **Actual** (fatture emesse o ricevute). In ogni momento è possibile *trasferire* una voce all'area successiva, mantenendo la traccia della storia.

```
Budget  →  Prospect  →  Ordini  →  Actual
(Previsioni) (Opportunità) (Confermati) (Movimenti)
```

Le sezioni successive descrivono in dettaglio ciascuno di questi elementi.

---

## Le Quattro Aree e i Workspace

### Le Quattro Aree

Ogni voce appartiene a una delle quattro aree. L'area determina il significato dello stage e il posizionamento della voce nel ciclo finanziario.

#### Budget — Previsioni e Opportunità
- **Stage 0:** Incerto
- **Stage 1:** Probabile

L'area Budget supporta due modalità di utilizzo complementari, che possono coesistere nello stesso workspace:

**Modalità previsionale** — Inserisci un piano strutturato di entrate e uscite per un periodo (mese, trimestre, anno). Le voci rappresentano budget approvati o stimati che servono come baseline per il confronto con i dati consuntivi di Actual. Esempio: canoni ricorrenti pianificati, obiettivi di fatturato per reparto, spese previste per campagne marketing.

**Modalità pipeline iniziale** — Inserisci opportunità commerciali in fase molto preliminare, prima ancora che diventino trattative attive (Prospect). Budget è in questo caso la prima stazione del funnel: un'opportunità nasce qui come «Incerta», viene qualificata e — se si trasforma in una trattativa concreta — viene trasferita a Prospect. Esempio: lead ricevuti a una fiera, richieste generiche di preventivo, potenziali clienti in fase di discovery.

Gli stage si adattano naturalmente a entrambi gli usi: *Incerto* = previsione a bassa probabilità o lead non qualificato; *Probabile* = previsione consolidata o opportunità qualificata.

#### Prospect — Opportunità
- **Stage 0:** Non approvato
- **Stage 1:** Approvato

Trattative commerciali in corso e opportunità da confermare. Permette di stimare i ricavi prima ancora che l'ordine sia formalizzato.

#### Ordini — Ordini Confermati
- **Stage 0:** Non consegnato
- **Stage 1:** Consegnato

Impegni formali ricevuti o emessi, non ancora fatturati. Rappresentano obbligazioni certe ma non ancora liquidate.

#### Actual — Movimenti Effettivi
- **Stage 0:** Non pagato
- **Stage 1:** Pagato

Fatture emesse, ricevute e movimenti bancari reali. È l'area di consuntivo: qui finiscono tutte le voci una volta fatturate.

---

### Voci Attive e Passive

Ogni area gestisce sia **voci attive** (entrate, segno positivo) che **voci passive** (uscite, segno negativo). Il segno non dipende dall'area: una fattura ricevuta da un fornitore può stare in Actual così come un costo pianificato può stare in Budget.

| Tipo | Segno | Esempi |
|---|---|---|
| **Voce attiva** | + positivo | Fattura emessa, acconto ricevuto, ricavo da ordine, obiettivo di vendita |
| **Voce passiva** | − negativo | Fattura ricevuta, pagamento fornitore, affitto, costo operativo pianificato |

Il segno si sceglie nel campo **Tipo** (Entrata / Uscita) al momento della creazione. Il campo **Imponibile** viene memorizzato con il segno corrispondente (+/−) e il pannello Cashflow somma algebricamente tutte le voci del periodo.

**Marginalità per Codice Progetto** — Assegnando lo stesso **Codice Progetto** a tutte le voci di una commessa (sia attive che passive, in qualsiasi area), è possibile filtrare la griglia per quel codice e leggere immediatamente nella riga di totale la somma algebrica di ricavi e costi: il margine lordo del progetto, aggiornato in tempo reale man mano che le voci avanzano nel workflow. Utile per cantieri, campagne marketing, progetti software, eventi.

---

### I Workspace

Un workspace è il contenitore dei dati finanziari. È possibile avere più workspace (ad esempio uno per società, uno per divisione o uno per progetto) e passare dall'uno all'altro dal selettore in alto a sinistra.

| Componente | Descrizione |
|---|---|
| **Nome** | Identificativo del workspace (es. «Acme SRL», «Budget 2026», «Progetto Alpha»). |
| **Descrizione** | Note libere opzionali. |
| **Conti Bancari** | Conti associati al workspace, con saldo iniziale e fido. Ogni voce può essere collegata a un conto specifico. |
| **Impostazioni** | Configurazioni avanzate: P.IVA (per import SDI), mappature colonne Excel, mappature fornitori, timeout sessione. |

### Selezione Multi-Workspace e Multi-Area

Workspace e area sono entrambi **multi-selezionabili**: la griglia mostra sempre i record che corrispondono all'intersezione delle selezioni attive.

**Multi-workspace** — Nella sidebar a sinistra ogni workspace ha un checkbox:
- Click sul **checkbox** → aggiunge o rimuove quel workspace dalla selezione (almeno uno deve restare sempre attivo)
- Click sul **nome** → seleziona solo questo workspace, deseleziona tutti gli altri

Con più workspace selezionati la griglia aggrega i record di tutti in un'unica vista. Nota: import, export e creazione di nuove voci sono disponibili solo quando è selezionato un **singolo** workspace.

**Multi-area** — Nella barra delle aree in cima alla griglia:
- Click sull'**icona circolare** accanto al nome → aggiunge o rimuove quell'area dalla selezione
- Click sul **testo** del nome → seleziona solo questa area, deseleziona le altre

Esempi di viste composite:

| Vista | Workspace | Aree attive | Utilità tipica |
|---|---|---|---|
| Consolidato di gruppo | Tutti | Solo Actual | Tutte le fatture di tutte le società in un colpo |
| Posizione consuntiva | Uno | Ordini + Actual | Ordini aperti + fatturato dell'esercizio |
| Funnel commerciale | Uno | Budget + Prospect | Pipeline dall'opportunità alla trattativa |
| Quadro completo | Tutti | Tutte e quattro | Situazione finanziaria a 360° |

### Impostazioni Utente

Le preferenze personali (nome, email, password, lingua) sono accessibili tramite la voce **Impostazioni** nel menu utente in alto a destra. Non esiste una voce separata «Profilo»: tutto è centralizzato in un'unica schermata.

### Membri e Permessi

Ogni workspace può avere più membri. I permessi sono granulari per area e per segno (entrate/uscite).

| Ruolo / Permesso | Cosa consente |
|---|---|
| **Owner** | Accesso completo: gestione membri, impostazioni, cancellazione workspace. |
| **Admin** | Gestione membri e impostazioni, accesso a tutte le aree. |
| **Member** | Accesso in lettura/scrittura alle aree concesse; permessi granulari configurabili. |
| **Viewer** | Solo lettura su tutte le aree visibili. |
| **can_import / can_import_sdi** | Abilita l'importazione da Excel/CSV o da fatture elettroniche XML. |
| **can_export** | Abilita l'esportazione CSV delle voci. |

---

## Ciclo di Vita di una Voce

Questo capitolo descrive l'iter completo che una voce percorre da Budget ad Actual, illustrando come utilizzare il campo **Transaction ID** per mantenere traccia dell'intera storia documentale.

### Esempio: commessa da 10.000 €

**Contesto**: Cliente Demo SpA, progetto Sito Web, 10.000 € + IVA. L'ordine verrà fatturato in due rate: acconto 40% (4.000 €) e saldo 60% (6.000 €).

| Fase | Area | Stage | Transaction ID | Cosa succede |
|---|---|---|---|---|
| **1. Previsione** | Budget | 0 – Incerto | `PREV-2026-001` | Inserisci la voce come opportunità o previsione di ricavo. |
| **2. Offerta inviata** | Prospect | 1 – Approvato | `OFF-2026-042 PREV-2026-001` | Trasferisci a Prospect. Preponi il numero offerta al Transaction ID. |
| **3. Ordine confermato** | Ordini | 0 – Non consegnato | `ORD-2026-103 OFF-2026-042 PREV-2026-001` | Trasferisci a Ordini. Preponi il numero ordine. |
| **4. Dividi in rate** | Ordini | 0 – Non consegnato | stesso ID, Riferimento `(1/2)` e `(2/2)` | Usa "Dividi in Rate": genera due righe, acconto 4.000 € e saldo 6.000 €. |
| **5. Fattura acconto** | Actual | 0 – Non pagato | `FT-2026-0087 ORD-2026-103 OFF-2026-042 PREV-2026-001` | Trasferisci la rata 1/2 ad Actual. Preponi il numero fattura. |
| **6. Incasso acconto** | Actual | 1 – Pagato | (invariato) | Cambia stage a Pagato quando arriva il bonifico. |
| **7. Saldo in attesa** | Ordini | 0 – Non consegnato | `ORD-2026-103 OFF-2026-042 PREV-2026-001` | La rata 2/2 resta in Ordini fino alla prossima fatturazione. |
| **8. Fattura saldo** | Actual | 0 – Non pagato | `FT-2026-0112 ORD-2026-103 OFF-2026-042 PREV-2026-001` | Trasferisci il saldo ad Actual con il nuovo numero fattura. |

### Convenzione di prefissazione del Transaction ID

La regola è semplice: ogni volta che la voce avanza di area, si aggiunge il riferimento del nuovo documento **in testa** al campo Transaction ID, separato da uno spazio.

```
Budget   →   PREV-2026-001
Prospect →   OFF-2026-042 PREV-2026-001
Ordini   →   ORD-2026-103 OFF-2026-042 PREV-2026-001
Actual   →   FT-2026-0087 ORD-2026-103 OFF-2026-042 PREV-2026-001
```

Questo approccio garantisce tre vantaggi:

1. **Leggibilità immediata** — il documento più recente è sempre in testa, visibile senza espandere il campo.
2. **Ricerca trasversale** — cercando un qualsiasi documento intermedio (es. `OFF-2026-042`) si trovano tutte le voci correlate, indipendentemente dall'area in cui si trovano in quel momento.
3. **Tracciabilità completa** — l'intera catena documentale (previsione → offerta → ordine → fattura) è conservata in un singolo campo senza bisogno di note aggiuntive.

> Non esiste un formato obbligatorio per i prefissi: `PREV-`, `OFF-`, `ORD-`, `FT-` sono convenzioni consigliate. Ogni azienda può adottare i propri codici documentali.

---

## I Campi delle Voci

Una **Voce** (Record) è l'unità base di Forecasto. Ogni voce rappresenta un movimento finanziario previsto o effettivo, caratterizzato dai campi descritti di seguito.

### Identificazione

| Campo | Chiave DB | Descrizione |
|---|---|---|
| **Conto** | `account` | Nome del cliente, fornitore o contropartita. Campo obbligatorio. Supporta **autocompletamento** dai valori già inseriti nel workspace. |
| **Riferimento** | `reference` | Descrizione del movimento (causale, numero fattura, ecc.). Obbligatorio. Supporta **autocompletamento** dai valori già inseriti nel workspace. |
| **ID Transazione** | `transaction_id` | Identificativo esterno univoco (codice banca, numero documento, UUID). Obbligatorio alla creazione. Vedi la convenzione di prefissazione nel capitolo *Ciclo di Vita di una Voce*. |
| **Codice Progetto** | `project_code` | Codice progetto o centro di costo. Facoltativo. Consente filtri, raggruppamenti per progetto e analisi di marginalità. Supporta **autocompletamento** dai valori già inseriti nel workspace. |

> **Autocompletamento workspace-aware** — I campi Conto, Riferimento e Codice Progetto mostrano un dropdown di suggerimenti mentre si digita. I valori proposti provengono direttamente dai record già presenti nel workspace (non dalla cronologia del browser). Se sono selezionati più workspace contemporaneamente, i suggerimenti vengono aggregati da tutti. Il campo rimane sempre a testo libero: si può digitare qualsiasi valore anche se non è in lista.

### Importi

| Campo | Chiave DB | Descrizione |
|---|---|---|
| **Tipo (Entrata/Uscita)** | `sign` *(UI)* | Selettore che determina il segno dell'importo: Entrata (+) o Uscita (−). Campo solo UI, non salvato in DB. |
| **Imponibile** | `amount` | Importo netto, senza IVA. Positivo per entrate, negativo per uscite. |
| **IVA %** | `vat` | Aliquota IVA in percentuale (es. 22). Il campo Totale si aggiorna automaticamente. |
| **Totale** | `total` | Importo lordo (Imponibile × (1 + IVA%)). È il valore usato nel cashflow. |
| **Detr. IVA %** | `vat_deduction` | Percentuale di detraibilità IVA (0–100). Default 100%. Riduce la quota IVA recuperabile. |

### Date

| Campo | Chiave DB | Descrizione |
|---|---|---|
| **Data Cashflow** | `date_cashflow` | Data prevista del movimento di cassa. Campo obbligatorio. Determina la posizione nel grafico cashflow. |
| **Data Offerta** | `date_offer` | Data del documento (fattura, ordine, offerta). Se omessa, coincide con la Data Cashflow. |
| **Prossima Revisione** | `review_date` | Data entro la quale riesaminare la voce. Usata nella modalità Revisione Zero. |

### Stato e Follow-up

| Campo | Chiave DB | Descrizione |
|---|---|---|
| **Stato** | `stage` | Stage binario (0 o 1). Il significato dipende dall'area: es. in Actual = Non pagato / Pagato. |
| **Responsabile** | `owner` | Persona incaricata di gestire o seguire la voce. Testo libero. |
| **Prossima Azione** | `nextaction` | Descrizione dell'azione da compiere. Evidenziata in ambra nella vista dettaglio. |
| **Conto Bancario** | `bank_account_id` | Collega la voce a un conto bancario specifico del workspace. |

### Note e Metadati

| Campo | Chiave DB | Descrizione |
|---|---|---|
| **Note** | `note` | Campo libero in formato Markdown. Visualizzato con espandi/comprimi nella griglia. |
| **Creato il / da** | `created_at` | Timestamp e utente di creazione. Sola lettura. |
| **Modificato il / da** | `updated_at` | Timestamp e utente dell'ultima modifica. Sola lettura. |
| **Cronologia Trasferimenti** | `transfer_history` | Log automatico di tutti i trasferimenti di area, con data e nota. |

---

## Funzioni della Griglia Voci

La griglia è la vista principale di ogni area. Permette di visualizzare, filtrare, selezionare e operare sulle voci in modo efficiente.

### Visualizzazione e Navigazione

| Funzione | Descrizione |
|---|---|
| **Ordina per colonna** | Clic sull'intestazione di colonna per ordinare crescente/decrescente. Colonne disponibili: N., Area, Stato, Data, Conto, Riferimento, ID, Responsabile, Progetto, Imponibile, Totale. |
| **Dimensione pagina** | Selettore 50 / 100 / 500 / Tutti. Default 100. Navigazione tra le pagine con i pulsanti freccia. |
| **Vista compatta / estesa** | Modalità compatta: testo troncato con ellissi. Modalità estesa: testo a capo per leggere contenuti lunghi. |
| **Colonne visibili** | Selettore per mostrare/nascondere: N. sequenziale, Responsabile, Codice Progetto, Area (solo in vista multi-area). |
| **Evidenziazioni** | Scaduto (sfondo arancione): stage 0 con data cashflow ≤ oggi. Selezionato: grigio. Visitato: tinta leggera. Eliminato: opacità ridotta. |
| **Riga di totale** | In fondo alla griglia: totali di Imponibile e Totale per tutti i record. Con selezione attiva mostra anche il subtotale della selezione. |

### Selezione e Operazioni Massive

Spuntare il checkbox di una o più righe attiva la **barra di azioni massive**. Le operazioni disponibili sono:

| Operazione | Record richiesti | Descrizione |
|---|---|---|
| **Elimina** | 1+ | Elimina (soft-delete) le voci selezionate dopo conferma. |
| **Unisci** | 2+ | Unisce le voci in una sola, sommando gli importi e unendo le note. |
| **Sposta Date** | 1+ | Sposta la Data Cashflow di N giorni su tutta la selezione (positivo = avanti, negativo = indietro). |
| **Imposta Giorno** | 1+ | Imposta il giorno del mese della Data Cashflow su un valore fisso (es. 28 per fine mese). |
| **Cambia Stage** | 1+ | Imposta lo stage a 0 o 1 su tutta la selezione in un'unica operazione. |
| **Trasferisci** | 1+ | Sposta le voci in un'altra area del workflow (es. da Ordini ad Actual), con nota facoltativa. |
| **Sposta in altro Workspace** | 1+ | Trasferisce le voci selezionate in un workspace diverso. |
| **Modifica Massiva** | 1+ | Apre un pannello per modificare simultaneamente gli stessi campi su tutte le voci selezionate. |
| **Dividi in Rate** | 1 | Dalla voce selezionata genera N rate mensili di importo proporzionale. |
| **Clona** | 1 | Duplica la voce selezionata con tutti i campi originali. |
| **Esporta CSV** | 1+ | Scarica le voci selezionate in formato CSV (separatore punto e virgola). |

---

## La Revisione Zero

La **Revisione Zero** è una modalità operativa pensata per tenere sotto controllo le voci in **stage 0** (non ancora completate) che richiedono attenzione periodica. «Zero» si riferisce sia allo stage 0 sia all'obiettivo di portare a zero le voci in attesa di revisione.

### Attivazione

La modalità si attiva con il pulsante **Revisione Zero** presente nella barra superiore della griglia. Una volta attiva, vengono mostrati filtri e controlli aggiuntivi specifici per questa modalità.

### Filtri Disponibili in Modalità Revisione

| Filtro | Opzioni | Effetto |
|---|---|---|
| **Scadute** | Tutte / Sì / No | Filtra le voci in base allo stato della *Prossima Revisione*: «Sì» mostra solo le voci con data di revisione passata (scaduta), «No» mostra quelle non ancora scadute. |
| **Prossima Azione** | Tutte / Con azione / Senza azione | Filtra in base alla presenza o assenza del campo *Prossima Azione*, permettendo di isolare le voci che richiedono un intervento definito. |

### Azioni Rapide di Revisione

Nel pannello di modifica di una voce, quando la modalità Revisione Zero è attiva, compaiono due pulsanti rapidi:

| Pulsante | Comportamento |
|---|---|
| **Rivedi 7gg** | Imposta la Prossima Revisione a oggi + 7 giorni e salva la voce immediatamente. |
| **Rivedi 15gg** | Imposta la Prossima Revisione a oggi + 15 giorni e salva la voce immediatamente. |

### Casi d'Uso Tipici

| Scenario | Come si usa Revisione Zero |
|---|---|
| **Sollecito pagamenti** | Le fatture emesse (Actual, stage 0 = Non pagato) vengono monitorate con data di revisione ricorrente. Ogni 7 o 15 giorni si aggiorna la data dopo il sollecito al cliente. |
| **Rinnovi contrattuali** | Ordini in scadenza vengono segnalati con Prossima Azione = «Verificare rinnovo» e una data di revisione prima della scadenza. |
| **Conferma ordini aperti** | Prospect o Ordini con stage 0 che attendono conferma dal cliente vengono tenuti in lista revisione fino all'aggiornamento dello stato. |
| **Adempimenti ricorrenti** | Voci di adempimenti periodici (affitti, assicurazioni, utenze) vengono ripianificate con la revisione a 15 o 30 giorni. |

> La modalità Revisione Zero non altera i dati della voce: agisce esclusivamente sul campo **Prossima Revisione** e sul campo **Prossima Azione**. La Prossima Azione appare evidenziata in **ambra** nella vista dettaglio per richiamare l'attenzione dell'operatore.

---

## Il Pannello Cashflow

La sezione **Cashflow** è la proiezione temporale della liquidità aziendale. Aggrega le voci selezionate per area e periodo, calcola i saldi progressivi e visualizza l'andamento in un grafico interattivo.

### Parametri di Configurazione

| Parametro | Descrizione |
|---|---|
| **Intervallo date** | Data di inizio e fine del periodo di analisi. Obbligatorio. |
| **Aree incluse** | Selezione multipla: Budget, Prospect, Ordini, Actual. Consente di confrontare scenari (es. solo Actual vs Actual + Ordini). |
| **Filtro Area:Stage** | Formato `area:stage` (es. `actual:0`, `orders:1`). Permette di includere solo le voci con uno stage specifico per ogni area. |
| **Raggruppa per** | Granularità del grafico: Giorno, Settimana, Mese. |
| **Conto Bancario** | Filtro facoltativo per vedere il cashflow di un singolo conto corrente. |
| **Codice Progetto** | Filtro facoltativo per analizzare il flusso di cassa di un progetto specifico. |

### Metriche Riepilogative

Le card nella parte superiore del pannello mostrano i valori aggregati del periodo:

| Metrica | Calcolo |
|---|---|
| **Saldo Iniziale** | Saldo di apertura dei conti bancari associati al workspace all'inizio del periodo. |
| **Entrate Previste** | Somma di tutti i movimenti positivi (Totale) nel periodo selezionato. |
| **Uscite Previste** | Somma di tutti i movimenti negativi (Totale) nel periodo selezionato (valore assoluto). |
| **Saldo Finale** | Saldo Iniziale + Entrate Previste − Uscite Previste. |
| **Saldo Minimo** | Punto più basso del saldo progressivo nel periodo, con la data corrispondente. |

### Grafico e Drill-down

Il grafico a barre mostra entrate e uscite per ogni periodo (giorno/settimana/mese), con una linea sovrapposta che rappresenta il **saldo progressivo**. Cliccando su una barra si apre il pannello di **drill-down**: una lista dettagliata di tutte le voci che contribuiscono a quel periodo, con la possibilità di aprire e modificare ogni singola voce.

### Tabella di Dettaglio e Snapshot

| Funzione | Descrizione |
|---|---|
| **Tabella periodo** | Sezione espandibile con una riga per ciascun periodo: Data, Entrate, Uscite, Netto, Saldo Progressivo. |
| **Esporta CSV** | Scarica la tabella di dettaglio in formato CSV (separatore `;`). |
| **Balance Snapshot** | Permette di registrare il saldo bancario reale in una data specifica. Quando è presente uno snapshot, il saldo progressivo riparte da quel valore, ricalibrandosi con i dati effettivi. Utile per la riconciliazione bancaria. |

---

## Le Funzioni di Importazione

Forecasto offre tre modalità di importazione per caricare voci in blocco. Tutte richiedono il permesso **`can_import`** o **`can_import_sdi`** configurato nelle impostazioni del workspace.

### 1 — Importazione Excel / CSV

Procedura guidata multi-step per importare file `.xlsx`, `.xls` e `.csv`. Accessibile dal menù **Importa** nella barra degli strumenti.

| Fase | Descrizione |
|---|---|
| **1. Selezione file** | Trascina il file nella finestra o usa il selettore. Formati accettati: `.xlsx`, `.xls`, `.csv`. |
| **2. Scelta area** | Seleziona l'area di destinazione (Budget, Prospect, Ordini, Actual). |
| **3. Mappatura colonne** | Abbina ogni colonna del file al campo Forecasto corrispondente. Il sistema suggerisce automaticamente le corrispondenze in base al nome della colonna. La mappatura viene memorizzata e riutilizzata al prossimo import dello stesso formato. |
| **4. Modalità importo** | *Colonna singola*: un unico campo importo (il segno determina entrata/uscita). *Colonne separate*: una colonna Entrate e una Uscite. |
| **5. Anteprima** | Mostra le prime righe con indicatori colorati: verde (ok), rosso (errore), giallo (avviso). Consente di correggere prima di procedere. |
| **6. Importazione** | Barra di avanzamento. Al termine: riepilogo con conteggio successi, errori e dettaglio righe fallite. |

**Campi mappabili:** `date_cashflow`, `reference`, `amount` / `total` / `vat_amount` / `vat_percent` / `amount_in` / `amount_out`, `account`, `date_offer`, `note`, `owner`, `project_code`, `transaction_id`, `stage`.

---

### 2 — Importazione Fatture Elettroniche (SDI / FatturaPA)

Importatore specializzato per fatture elettroniche italiane in formato XML (FatturaPA). Supporta upload multiplo di file `.xml` in un'unica operazione. Richiede il permesso **`can_import_sdi`** e la **P.IVA del workspace** configurata nelle impostazioni.

| Funzione | Descrizione |
|---|---|
| **Classificazione automatica** | Il sistema confronta la P.IVA del cedente/cessionario con quella del workspace. Se la P.IVA del workspace è quella del cessionario → fattura passiva. Se è quella del cedente → fattura attiva. |
| **Suddivisione in rate** | Fatture con più scadenze di pagamento vengono automaticamente suddivise in tante righe quante le rate, ciascuna con la propria data e importo. |
| **Riconoscimento fornitori** | P.IVA e denominazione già incontrate in precedenti import vengono riconosciute automaticamente, precompilando conto, detraibilità IVA e altri campi ricorrenti. |
| **Anteprima avanzata** | Mostra badge «nuovo fornitore» per contropartite nuove, segnala duplicati (stessa fattura già importata) e consente di editare data cashflow, conto e detraibilità IVA prima di confermare. |
| **Campi estratti** | Numero e data fattura, tipo (attiva/passiva), denominazione e P.IVA contropartita, imponibile, IVA, totale, scadenze di pagamento. |

---

### 3 — Importazione JSON (Backup / Migrazione)

Importazione diretta da file `.json` per scenari di backup, migrazione da altri sistemi o caricamento programmatico. Il file deve contenere un array di oggetti.

| Campo obbligatorio | Valori accettati |
|---|---|
| **`type`** | `"0"` = Actual, `"1"` = Ordini, `"2"` = Prospect, `"3"` = Budget |
| **`account`** | Testo libero (conto / contropartita) |
| **`reference`** | Testo libero (causale / riferimento) |
| **`date_cashflow`** | Formato `YYYY-MM-DD` |
| **`amount`** | Numero decimale (positivo = entrata, negativo = uscita) |
| **`total`** | Numero decimale (lordo IVA) |

Valori di default applicati se assenti: IVA = 22%, Detr. IVA = 100%, Stage = 0, `transaction_id` = generato automaticamente.