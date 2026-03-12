# Forecasto – Skill di Onboarding per Claude

Questa guida ti aiuta a connettere Claude a Forecasto in pochi minuti, in modo da poter gestire il tuo cash flow direttamente in conversazione.

---

## Prerequisiti

- Un account **Claude Pro, Team o Enterprise** (il piano gratuito non supporta le connessioni MCP)
- Un account Forecasto attivo
- Accesso alle impostazioni di Claude.ai dal browser desktop (consigliato)

---

## Passo 1 – Connetti il server MCP di Forecasto

> **Piano Pro o Team?**
> - **Team:** il connettore Forecasto potrebbe essere già stato configurato dall'amministratore Claude della tua azienda. In questo caso troverai Forecasto già nell'elenco dei connettori e dovrai solo cliccare su **Collega** (vai al punto 7).
> - **Pro:** dovrai aggiungere il connettore manualmente seguendo tutti i passaggi qui sotto.

1. Vai su **claude.ai** e accedi al tuo account
2. Clicca sull'icona del tuo profilo in alto a destra → **Impostazioni**
3. Seleziona la voce **Connettori** (o *Integrations / MCP Servers*, a seconda della tua versione)
4. Clicca su **Aggiungi server MCP**
5. Inserisci i seguenti dati:
   - **Nome:** `Forecasto`
   - **URL:** `https://app.forecasto.it/mcp`
6. Salva — il server apparirà nell'elenco dei connettori
7. Clicca sul tasto **Collega** accanto a Forecasto
8. Inserisci le tue **credenziali Forecasto** (email e password) nella finestra che si apre
9. Conferma e ricarica la pagina

> ✅ Se la connessione è attiva, vedrai "Forecasto" nell'elenco dei connettori con stato **Connesso**.

---

## Passo 2 – Scarica e carica le skill

Le skill sono istruzioni specializzate che guidano Claude nell'usare Forecasto in modo ottimale.

### Scarica le skill

Vai su: **[https://app.forecasto.it/skills](https://app.forecasto.it/skills)**

Troverai i file `.md` delle skill disponibili. Scaricali sul tuo computer.

### Carica le skill in Claude

1. Vai su **claude.ai** → **Impostazioni** → **Skill** (o *Custom Instructions / Knowledge*)
2. Clicca su **Aggiungi skill** o **Carica file**
3. Seleziona i file `.md` scaricati nel passo precedente
4. Salva

> Le skill rimarranno attive per tutte le conversazioni future fino a quando non le rimuovi.

---

## Passo 3 – Verifica che tutto funzioni

Apri una nuova conversazione con Claude e scrivi:

```
Lista i workspace Forecasto disponibili
```

Se la connessione è attiva, Claude risponderà con l'elenco dei tuoi workspace. Sei pronto per iniziare.

---

## Prompt di avvio consigliato

Per iniziare subito a lavorare, puoi usare questo prompt:

```
Leggi le skill Forecasto e mostrami il cashflow del workspace [nome workspace] 
per i prossimi 30 giorni.
```

---

## Risoluzione dei problemi più comuni

**Il server MCP non risponde**
Verifica che l'URL sia esatto: `https://app.forecasto.it/mcp`. Controlla la tua connessione internet e riprova. Se il problema persiste, contatta il supporto.

**Le skill non vengono riconosciute**
Assicurati di aver caricato i file nella sezione corretta delle impostazioni di Claude. Prova ad aprire una nuova conversazione dopo il caricamento.

**Non vedo la voce "Connettori" nelle impostazioni**
Questa funzione è disponibile solo per i piani Pro, Team ed Enterprise. Verifica il tuo piano su claude.ai/settings.

**L'elenco dei workspace è vuoto**
Il tuo utente Forecasto potrebbe non avere workspace assegnati. Accedi a [app.forecasto.it](https://app.forecasto.it) e verifica.

---

## Supporto

Per qualsiasi problema durante il setup o l'utilizzo:

📧 **[support@forecasto.it](mailto:support@forecasto.it)**

Il team di supporto risponde tipicamente entro un giorno lavorativo.
