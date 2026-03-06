export interface TourStepDef {
  id: string
  elementSelector: string
  popover: {
    title: string
    description: string
    side?: 'top' | 'bottom' | 'left' | 'right'
  }
  beforeStep?: () => Promise<void>
  flashSelector?: string
  waitForSelector?: string
  waitTimeout?: number
}

export interface TourContext {
  setArea: (area: string) => void
  setCreateRecordDialogOpen: (open: boolean) => void
  primaryWorkspaceId: string
  updateRecord: (params: { recordId: string; data: Record<string, unknown>; workspaceId?: string }) => Promise<void>
  transferRecord: (params: { recordId: string; toArea: string; note?: string }) => Promise<void>
  setTourRecordId: (id: string | null) => void
  setTourSplitRecordIds: (ids: string[]) => void
  getTourRecordId: () => string | null
  getTourSplitRecordIds: () => string[]
  dashboardActions: {
    openSplitForRecord?: (record: unknown) => void
    selectRecord?: (record: unknown) => void
    editRecord?: (record: unknown) => void
    selectAndEditRecord?: (record: unknown) => void
    getRecords?: () => unknown[]
  }
}

// Utility to set react-hook-form controlled input values
function setFormField(inputId: string, value: string) {
  const el = document.getElementById(inputId) as HTMLInputElement | null
  if (!el) return
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
}

// Prepend a new value to an existing form field (preserves history)
function prependFormField(inputId: string, prefix: string) {
  const el = document.getElementById(inputId) as HTMLInputElement | null
  if (!el) return
  const current = el.value || ''
  const newValue = current ? `${prefix} ${current}` : prefix
  setFormField(inputId, newValue)
}

function clickElement(selector: string) {
  const el = document.querySelector(selector) as HTMLElement | null
  el?.click()
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Poll getRecords() until a record matching the predicate appears (max ~5s)
async function waitForRecord(
  getRecords: () => unknown[],
  predicate: (r: Record<string, unknown>) => boolean,
  timeout = 5000,
): Promise<Record<string, unknown> | null> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const records = getRecords() as Record<string, unknown>[]
    const found = records.find(predicate)
    if (found) return found
    await delay(400)
  }
  return null
}

export function createTourSteps(ctx: TourContext): TourStepDef[] {
  const today = new Date().toISOString().split('T')[0]
  const cashflowDate = new Date()
  cashflowDate.setDate(cashflowDate.getDate() + 60)
  const cashflowDateStr = cashflowDate.toISOString().split('T')[0]

  return [
    // === WELCOME ===
    {
      id: 'welcome',
      elementSelector: '[data-tour="area-tabs"]',
      popover: {
        title: 'Benvenuto in Forecasto!',
        description: 'Questa guida ti mostrerà il flusso completo di gestione finanziaria: dalla previsione (Budget) fino all\'incasso (Actual). Seguimi passo passo!',
        side: 'bottom',
      },
      beforeStep: async () => {
        ctx.setArea('budget')
        await delay(300)
      },
    },

    // === EXPLAIN AREAS ===
    {
      id: 'explain-areas',
      elementSelector: '[data-tour="area-tabs"]',
      popover: {
        title: 'Le 4 Aree',
        description: 'Budget = previsioni | Prospect = trattative | Orders = ordini confermati | Actual = fatturato e incassato. Ogni record avanza da sinistra a destra.',
        side: 'bottom',
      },
    },

    // === SELECT BUDGET TAB ===
    {
      id: 'select-budget',
      elementSelector: '[data-tour="tab-budget"]',
      popover: {
        title: 'Area Budget',
        description: 'Iniziamo dal Budget: qui inserisci le previsioni di entrata e uscita future.',
        side: 'bottom',
      },
      flashSelector: '[data-tour="tab-budget"]',
    },

    // === CLICK NEW RECORD ===
    {
      id: 'click-new',
      elementSelector: '[data-tour="btn-new-record"]',
      popover: {
        title: 'Crea un Nuovo Record',
        description: 'Premi questo pulsante per inserire una nuova previsione.',
        side: 'bottom',
      },
      beforeStep: async () => {
        ctx.setCreateRecordDialogOpen(true)
        await delay(300)
      },
      waitForSelector: '[data-tour="form-sign"]',
      flashSelector: '[data-tour="btn-new-record"]',
    },

    // === FORM: SIGN ===
    {
      id: 'form-sign',
      elementSelector: '[data-tour="form-sign"]',
      popover: {
        title: 'Tipo: Entrata o Uscita',
        description: 'Seleziona "Entrata (+)" per i ricavi attesi, "Uscita (-)" per i costi.',
        side: 'left',
      },
      beforeStep: async () => {
        // Click the "Entrata (+)" button - it's the first button in the sign container
        const buttons = document.querySelectorAll('[data-tour="form-sign"] button')
        if (buttons[0]) (buttons[0] as HTMLElement).click()
        await delay(200)
      },
      flashSelector: '[data-tour="form-sign"]',
    },

    // === FORM: ACCOUNT ===
    {
      id: 'form-account',
      elementSelector: '#account',
      popover: {
        title: 'Conto',
        description: 'Il nome del cliente o fornitore. Ad esempio: "Cliente Demo SpA".',
        side: 'left',
      },
      beforeStep: async () => {
        setFormField('account', 'Cliente Demo SpA')
        await delay(200)
      },
      flashSelector: '#account',
    },

    // === FORM: REFERENCE ===
    {
      id: 'form-reference',
      elementSelector: '#reference',
      popover: {
        title: 'Riferimento',
        description: 'Una descrizione della commessa o del motivo: "Progetto Sito Web".',
        side: 'left',
      },
      beforeStep: async () => {
        setFormField('reference', 'Progetto Sito Web')
        await delay(200)
      },
      flashSelector: '#reference',
    },

    // === FORM: TRANSACTION ID ===
    {
      id: 'form-transaction-id',
      elementSelector: '#transaction_id',
      popover: {
        title: 'ID Transazione',
        description: 'Un identificativo del documento. In fase Budget usiamo un codice previsione: "PREV-2026-001".',
        side: 'left',
      },
      beforeStep: async () => {
        setFormField('transaction_id', 'PREV-2026-001')
        await delay(200)
      },
      flashSelector: '#transaction_id',
    },

    // === FORM: DATES ===
    {
      id: 'form-dates',
      elementSelector: '#date_cashflow',
      popover: {
        title: 'Date',
        description: `Data Cashflow = quando prevedi l'incasso (fra ~60 giorni). Data Offerta = quando registri il record (oggi).`,
        side: 'left',
      },
      beforeStep: async () => {
        setFormField('date_cashflow', cashflowDateStr)
        setFormField('date_offer', today)
        await delay(200)
      },
      flashSelector: '#date_cashflow',
    },

    // === FORM: AMOUNT ===
    {
      id: 'form-amount',
      elementSelector: '#amount',
      popover: {
        title: 'Imponibile',
        description: 'L\'importo netto (senza IVA). Inseriamo 10.000 €. L\'IVA e il totale si calcolano automaticamente.',
        side: 'left',
      },
      beforeStep: async () => {
        setFormField('amount', '10000')
        await delay(100)
        // Trigger VAT calculation: set vat to 22
        setFormField('vat', '22')
        await delay(200)
      },
      flashSelector: '#amount',
    },

    // === FORM: STAGE ===
    {
      id: 'form-stage',
      elementSelector: '[data-tour="form-stage"]',
      popover: {
        title: 'Stato',
        description: 'In Budget: "Incerto" o "Probabile". Selezioniamo "Probabile" per indicare buona probabilità.',
        side: 'left',
      },
      beforeStep: async () => {
        // Click the "Probabile" button (second button = stage '1')
        const buttons = document.querySelectorAll('[data-tour="form-stage"] button')
        if (buttons[1]) (buttons[1] as HTMLElement).click()
        await delay(200)
      },
      flashSelector: '[data-tour="form-stage"]',
    },

    // === FORM: SAVE ===
    {
      id: 'form-save',
      elementSelector: '[data-tour="form-submit"]',
      popover: {
        title: 'Salva il Record',
        description: 'Tutti i campi sono compilati. Premi "Avanti" per salvare il record.',
        side: 'top',
      },
      flashSelector: '[data-tour="form-submit"]',
    },

    // === RECORD SAVED — show in grid ===
    {
      id: 'record-saved',
      elementSelector: '[data-tour="area-tabs"]',
      popover: {
        title: 'Record Creato!',
        description: 'Il record "Cliente Demo SpA" è ora nella griglia Budget. Ora lo apriamo in modifica per promuoverlo verso Prospect.',
        side: 'bottom',
      },
      beforeStep: async () => {
        // Actually submit the form now
        clickElement('[data-tour="form-submit"]')
        await delay(2000) // Wait for API + UI update
      },
    },

    // === SELECT RECORD — show detail panel ===
    {
      id: 'select-record',
      elementSelector: '[data-tour="btn-edit-record"]',
      popover: {
        title: 'Dettaglio Record',
        description: 'Ecco il pannello di dettaglio con il riepilogo del record appena creato. Per modificarlo premi "Modifica Record".',
        side: 'left',
      },
      beforeStep: async () => {
        const tourRecord = await waitForRecord(
          () => ctx.dashboardActions.getRecords?.() || [],
          (r) => r.account === 'Cliente Demo SpA',
        )
        if (tourRecord) {
          ctx.setTourRecordId(tourRecord.id as string)
          ctx.dashboardActions.selectRecord?.(tourRecord)
          await delay(800)
        }
      },
      waitForSelector: '[data-tour="btn-edit-record"]',
      flashSelector: '[data-tour="btn-edit-record"]',
    },

    // === CLICK EDIT — open edit form ===
    {
      id: 'open-edit',
      elementSelector: '#transaction_id',
      popover: {
        title: 'Pannello di Modifica',
        description: 'Ora siamo in modalità modifica. Da qui possiamo aggiornare i campi e promuovere il record.',
        side: 'left',
      },
      beforeStep: async () => {
        clickElement('[data-tour="btn-edit-record"]')
        await delay(800)
      },
      waitForSelector: '[data-tour="form-promote"]',
    },

    // === UPDATE TID FOR PROSPECT ===
    {
      id: 'update-tid-prospect',
      elementSelector: '#transaction_id',
      popover: {
        title: 'Numero Offerta',
        description: 'Aggiorniamo l\'ID Transazione con il numero offerta: "OFF-2026-042". Ad ogni fase aggiungiamo il riferimento del documento.',
        side: 'left',
      },
      beforeStep: async () => {
        prependFormField('transaction_id', 'OFF-2026-042')
        await delay(300)
      },
      flashSelector: '#transaction_id',
    },

    // === SHOW PROMOTE BUTTON ===
    {
      id: 'show-promote-prospect',
      elementSelector: '[data-tour="form-promote"]',
      popover: {
        title: 'Pulsante di Promozione',
        description: 'Questo pulsante salva le modifiche e sposta il record in "Prospect". Premi "Avanti" per promuovere.',
        side: 'top',
      },
      flashSelector: '[data-tour="form-promote"]',
    },

    // === PROMOTE TO PROSPECT — execute ===
    {
      id: 'promote-prospect',
      elementSelector: '[data-tour="tab-prospect"]',
      popover: {
        title: 'Siamo in Prospect!',
        description: 'Il record è stato spostato in Prospect. Qui gestiamo le trattative in corso. Ora aggiungiamo il numero ordine.',
        side: 'bottom',
      },
      beforeStep: async () => {
        clickElement('[data-tour="form-promote"]')
        await delay(2000)
        ctx.setArea('prospect')
        await delay(500)
      },
      flashSelector: '[data-tour="tab-prospect"]',
    },

    // === SELECT RECORD IN PROSPECT — show detail ===
    {
      id: 'select-record-prospect',
      elementSelector: '[data-tour="btn-edit-record"]',
      popover: {
        title: 'Record in Prospect',
        description: 'Ecco il record nella nuova area. Clicchiamo "Modifica Record" per aggiornare il riferimento.',
        side: 'left',
      },
      beforeStep: async () => {
        const tourRecord = await waitForRecord(
          () => ctx.dashboardActions.getRecords?.() || [],
          (r) => r.account === 'Cliente Demo SpA',
        )
        if (tourRecord) {
          ctx.dashboardActions.selectRecord?.(tourRecord)
          await delay(800)
        }
      },
      waitForSelector: '[data-tour="btn-edit-record"]',
      flashSelector: '[data-tour="btn-edit-record"]',
    },

    // === CLICK EDIT IN PROSPECT ===
    {
      id: 'open-edit-prospect',
      elementSelector: '#transaction_id',
      popover: {
        title: 'Modifica in Prospect',
        description: 'Siamo in modifica. Aggiorniamo l\'ID con il numero ordine.',
        side: 'left',
      },
      beforeStep: async () => {
        clickElement('[data-tour="btn-edit-record"]')
        await delay(800)
      },
      waitForSelector: '#transaction_id',
    },

    // === UPDATE TID FOR ORDERS ===
    {
      id: 'update-tid-orders',
      elementSelector: '#transaction_id',
      popover: {
        title: 'Numero Ordine',
        description: 'L\'ordine è confermato! Inseriamo il numero ordine: "ORD-2026-103".',
        side: 'left',
      },
      beforeStep: async () => {
        prependFormField('transaction_id', 'ORD-2026-103')
        await delay(300)
      },
      flashSelector: '#transaction_id',
    },

    // === SHOW PROMOTE BUTTON TO ORDERS ===
    {
      id: 'show-promote-orders',
      elementSelector: '[data-tour="form-promote"]',
      popover: {
        title: 'Promuovi a Orders',
        description: 'Ora spostiamo il record in "Orders": gli ordini confermati dal cliente. Premi "Avanti".',
        side: 'top',
      },
      flashSelector: '[data-tour="form-promote"]',
    },

    // === PROMOTE TO ORDERS — execute ===
    {
      id: 'promote-orders',
      elementSelector: '[data-tour="tab-orders"]',
      popover: {
        title: 'Area Orders',
        description: 'Perfetto! Il record è ora in Orders. Il prossimo passo: dividere in rate (acconto 40% e saldo 60%).',
        side: 'bottom',
      },
      beforeStep: async () => {
        clickElement('[data-tour="form-promote"]')
        await delay(2000)
        ctx.setArea('orders')
        await delay(500)
      },
      flashSelector: '[data-tour="tab-orders"]',
    },

    // === OPEN SPLIT ===
    {
      id: 'open-split',
      elementSelector: '[role="dialog"]',
      popover: {
        title: 'Dividi in Rate',
        description: 'Questa è la funzione "Dividi": permette di suddividere un record in più rate con date e importi personalizzabili.',
        side: 'left',
      },
      beforeStep: async () => {
        const tourRecord = await waitForRecord(
          () => ctx.dashboardActions.getRecords?.() || [],
          (r) => r.account === 'Cliente Demo SpA',
        )
        if (tourRecord) {
          ctx.dashboardActions.openSplitForRecord?.(tourRecord)
          await delay(800)
        }
      },
      waitForSelector: '[role="dialog"]',
    },

    // === CONFIGURE SPLIT 40/60 ===
    {
      id: 'configure-split',
      elementSelector: '[role="dialog"]',
      popover: {
        title: 'Acconto 40% e Saldo 60%',
        description: 'Impostiamo le percentuali: 40% per l\'acconto (4.000 €) e 60% per il saldo (6.000 €). Le date sono automatiche: oggi e +1 mese.',
        side: 'left',
      },
      beforeStep: async () => {
        // Set first installment to 40%
        const percentInputs = document.querySelectorAll('[role="dialog"] table tbody input[type="number"]')
        // Table inputs per row: splitPercent, amount, vatPercent, total (4 inputs per row)
        // Row 1: inputs 0(%), 1(amount), 2(vatPercent), 3(total)
        // Row 2: inputs 4(%), 5(amount), 6(vatPercent), 7(total)
        if (percentInputs.length >= 8) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          )?.set
          if (nativeInputValueSetter) {
            // Set first row to 40%
            nativeInputValueSetter.call(percentInputs[0], '40')
            percentInputs[0].dispatchEvent(new Event('input', { bubbles: true }))
            percentInputs[0].dispatchEvent(new Event('change', { bubbles: true }))
            await delay(300)
            // Set second row to 60%
            nativeInputValueSetter.call(percentInputs[4], '60')
            percentInputs[4].dispatchEvent(new Event('input', { bubbles: true }))
            percentInputs[4].dispatchEvent(new Event('change', { bubbles: true }))
            await delay(300)
          }
        }
      },
    },

    // === SHOW SPLIT CONFIRM BUTTON ===
    {
      id: 'confirm-split',
      elementSelector: '[role="dialog"]',
      popover: {
        title: 'Conferma la Divisione',
        description: 'Le percentuali sono configurate: 40% acconto e 60% saldo. Premi "Avanti" per creare le due rate.',
        side: 'left',
      },
    },

    // === EXECUTE SPLIT AND SHOW RESULT ===
    {
      id: 'split-result',
      elementSelector: '[data-tour="area-tabs"]',
      popover: {
        title: 'Rate Create!',
        description: 'Ecco le due rate nella griglia: Acconto 40% (4.000 €) e Saldo 60% (6.000 €). Ora apriamo l\'acconto per aggiungere il numero fattura e promuoverlo in Actual.',
        side: 'bottom',
      },
      beforeStep: async () => {
        // Click "Crea 2 Rate" button inside the dialog
        const buttons = document.querySelectorAll('[role="dialog"] button')
        for (const btn of buttons) {
          if ((btn as HTMLElement).textContent?.includes('Crea')) {
            (btn as HTMLElement).click()
            break
          }
        }
        await delay(3000)

        // Track the new split record IDs (SplitDialog creates references like "... (1/2)")
        const records = (ctx.dashboardActions.getRecords?.() || []) as Record<string, unknown>[]
        const splitRecords = records.filter(r =>
          (r.account as string) === 'Cliente Demo SpA' &&
          (r.reference as string)?.includes('/')
        )
        const splitIds = splitRecords.map(r => r.id as string)
        ctx.setTourSplitRecordIds(splitIds)
        ctx.setTourRecordId(null)
      },
    },

    // === SELECT DEPOSIT — show detail ===
    {
      id: 'select-deposit',
      elementSelector: '[data-tour="btn-edit-record"]',
      popover: {
        title: 'Dettaglio Acconto',
        description: 'Ecco l\'acconto (rata 1/2) nel pannello di dettaglio. Apriamolo in modifica per aggiungere il numero fattura.',
        side: 'left',
      },
      beforeStep: async () => {
        // SplitDialog creates references like "Progetto Sito Web (1/2)"
        const deposit = await waitForRecord(
          () => ctx.dashboardActions.getRecords?.() || [],
          (r) => (r.reference as string)?.includes('1/2'),
        )
        if (deposit) {
          ctx.dashboardActions.selectRecord?.(deposit)
          await delay(800)
        }
      },
      waitForSelector: '[data-tour="btn-edit-record"]',
      flashSelector: '[data-tour="btn-edit-record"]',
    },

    // === CLICK EDIT DEPOSIT ===
    {
      id: 'open-deposit-edit',
      elementSelector: '#transaction_id',
      popover: {
        title: 'Modifica Acconto',
        description: 'Siamo in modifica. Aggiungiamo il numero fattura.',
        side: 'left',
      },
      beforeStep: async () => {
        clickElement('[data-tour="btn-edit-record"]')
        await delay(800)
      },
      waitForSelector: '#transaction_id',
    },

    // === UPDATE TID WITH INVOICE ===
    {
      id: 'update-tid-invoice',
      elementSelector: '#transaction_id',
      popover: {
        title: 'Numero Fattura',
        description: 'Inseriamo il numero fattura: "FT-2026-0087". Questo completa il ciclo documentale dell\'acconto.',
        side: 'left',
      },
      beforeStep: async () => {
        prependFormField('transaction_id', 'FT-2026-0087')
        await delay(300)
      },
      flashSelector: '#transaction_id',
    },

    // === SHOW PROMOTE BUTTON TO ACTUAL ===
    {
      id: 'show-promote-actual',
      elementSelector: '[data-tour="form-promote"]',
      popover: {
        title: 'Promuovi in Actual',
        description: 'La fattura è emessa! Premi "Avanti" per spostare l\'acconto in Actual (fatturato/incassato).',
        side: 'top',
      },
      flashSelector: '[data-tour="form-promote"]',
    },

    // === PROMOTE TO ACTUAL — execute ===
    {
      id: 'promote-actual',
      elementSelector: '[data-tour="tab-actual"]',
      popover: {
        title: 'Acconto in Actual!',
        description: 'L\'acconto è ora in Actual. Il saldo 60% resta in Orders fino alla prossima fatturazione.',
        side: 'bottom',
      },
      beforeStep: async () => {
        clickElement('[data-tour="form-promote"]')
        await delay(2000)
        ctx.setArea('actual')
        await delay(500)
      },
      flashSelector: '[data-tour="tab-actual"]',
    },

    // === TOUR COMPLETE ===
    {
      id: 'tour-complete',
      elementSelector: '[data-tour="area-tabs"]',
      popover: {
        title: 'Complimenti!',
        description: 'Hai completato il flusso: Budget → Prospect → Orders → Actual. Il saldo 60% resta in Orders fino alla prossima fatturazione. I record demo restano nel workspace.',
        side: 'bottom',
      },
      beforeStep: async () => {
        ctx.setArea('actual')
        await delay(500)
      },
    },
  ]
}
