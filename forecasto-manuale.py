#!/usr/bin/env python3
"""
Generatore del Manuale Utente di Forecasto
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfgen import canvas

# ─── COLORI BRAND ────────────────────────────────────────────────────────────
BLUE_DARK   = colors.HexColor("#1E3A5F")   # intestazioni principali
BLUE_MED    = colors.HexColor("#2563EB")   # accenti / bordi
BLUE_LIGHT  = colors.HexColor("#DBEAFE")   # sfondo tabelle header
GREY_TEXT   = colors.HexColor("#374151")   # corpo testo
GREY_LIGHT  = colors.HexColor("#F3F4F6")   # righe alternate
ACCENT      = colors.HexColor("#059669")   # verde per etichette area "actual"
ORANGE      = colors.HexColor("#D97706")
RED         = colors.HexColor("#DC2626")
WHITE       = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 1.8 * cm

# ─── NUMERO DI PAGINA ────────────────────────────────────────────────────────
def add_page_number(canvas_obj, doc):
    canvas_obj.saveState()
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.setFillColor(colors.HexColor("#9CA3AF"))
    # footer line
    canvas_obj.setStrokeColor(BLUE_MED)
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(MARGIN, 1.3*cm, PAGE_W - MARGIN, 1.3*cm)
    canvas_obj.drawString(MARGIN, 0.9*cm, "Forecasto — Manuale Utente")
    page_num = f"pag. {doc.page}"
    canvas_obj.drawRightString(PAGE_W - MARGIN, 0.9*cm, page_num)
    canvas_obj.restoreState()

# ─── STILI ───────────────────────────────────────────────────────────────────
def make_styles():
    styles = getSampleStyleSheet()

    s = {}

    s["cover_title"] = ParagraphStyle(
        "cover_title", fontName="Helvetica-Bold", fontSize=36,
        textColor=WHITE, alignment=TA_LEFT, leading=44, spaceAfter=8
    )
    s["cover_sub"] = ParagraphStyle(
        "cover_sub", fontName="Helvetica", fontSize=16,
        textColor=colors.HexColor("#BFDBFE"), alignment=TA_LEFT, leading=22
    )
    s["cover_version"] = ParagraphStyle(
        "cover_version", fontName="Helvetica", fontSize=9,
        textColor=colors.HexColor("#93C5FD"), alignment=TA_LEFT
    )

    s["h1"] = ParagraphStyle(
        "h1", fontName="Helvetica-Bold", fontSize=18,
        textColor=BLUE_DARK, spaceAfter=6, spaceBefore=4, leading=22
    )
    s["h2"] = ParagraphStyle(
        "h2", fontName="Helvetica-Bold", fontSize=12,
        textColor=BLUE_MED, spaceAfter=4, spaceBefore=10, leading=16
    )
    s["h3"] = ParagraphStyle(
        "h3", fontName="Helvetica-Bold", fontSize=10,
        textColor=GREY_TEXT, spaceAfter=2, spaceBefore=6, leading=14
    )
    s["body"] = ParagraphStyle(
        "body", fontName="Helvetica", fontSize=9.5,
        textColor=GREY_TEXT, spaceAfter=4, leading=14, alignment=TA_JUSTIFY
    )
    s["body_small"] = ParagraphStyle(
        "body_small", fontName="Helvetica", fontSize=8.5,
        textColor=GREY_TEXT, spaceAfter=3, leading=12
    )
    s["bullet"] = ParagraphStyle(
        "bullet", fontName="Helvetica", fontSize=9.5,
        textColor=GREY_TEXT, spaceAfter=3, leading=14,
        leftIndent=14, bulletIndent=0,
        bulletFontName="Helvetica", bulletFontSize=9.5
    )
    s["label"] = ParagraphStyle(
        "label", fontName="Helvetica-Bold", fontSize=8.5,
        textColor=BLUE_DARK
    )
    s["tag"] = ParagraphStyle(
        "tag", fontName="Helvetica-Bold", fontSize=8,
        textColor=WHITE
    )
    s["intro_lead"] = ParagraphStyle(
        "intro_lead", fontName="Helvetica", fontSize=11,
        textColor=BLUE_DARK, spaceAfter=10, leading=17, alignment=TA_JUSTIFY
    )

    return s


class ColorBox(Flowable):
    """Blocco colorato (usato per etichette area)."""
    def __init__(self, text, bg, fg=WHITE, width=90, height=18, radius=4):
        super().__init__()
        self.text = text
        self.bg = bg
        self.fg = fg
        self.width = width
        self.height = height
        self.radius = radius

    def draw(self):
        self.canv.setFillColor(self.bg)
        self.canv.roundRect(0, 0, self.width, self.height,
                            self.radius, fill=1, stroke=0)
        self.canv.setFillColor(self.fg)
        self.canv.setFont("Helvetica-Bold", 8)
        self.canv.drawCentredString(self.width / 2, 5, self.text)

    def wrap(self, *args):
        return self.width, self.height


class HRule(Flowable):
    def __init__(self, width=None, color=BLUE_MED, thickness=0.5):
        super().__init__()
        self._width = width
        self.color = color
        self.thickness = thickness

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 0, self._width or PAGE_W - 2 * MARGIN, 0)

    def wrap(self, avail_w, avail_h):
        return self._width or avail_w, 2


def section_header(title, styles):
    """Restituisce una lista di flowable per un'intestazione di sezione."""
    return [
        Spacer(1, 0.3*cm),
        Paragraph(title, styles["h1"]),
        HRule(color=BLUE_MED, thickness=1.2),
        Spacer(1, 0.3*cm),
    ]


def info_table(rows, col_widths, header_bg=BLUE_LIGHT, styles_dict=None):
    """Tabella informativa con intestazione colorata."""
    avail = PAGE_W - 2 * MARGIN
    ts = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
        ("TEXTCOLOR",  (0, 0), (-1, 0), BLUE_DARK),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, 0), 8.5),
        ("FONTNAME",   (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",   (0, 1), (-1, -1), 8.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, GREY_LIGHT]),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("GRID",       (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
        ("ROUNDEDCORNERS", [4]),
    ])
    t = Table(rows, colWidths=col_widths, style=ts, hAlign="LEFT")
    return t


# ─── COPERTINA ───────────────────────────────────────────────────────────────
def build_cover(canvas_obj, doc):
    canvas_obj.saveState()
    # sfondo intero
    canvas_obj.setFillColor(BLUE_DARK)
    canvas_obj.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # banda inferiore
    canvas_obj.setFillColor(BLUE_MED)
    canvas_obj.rect(0, 0, PAGE_W, 3.5*cm, fill=1, stroke=0)
    # striscia decorativa laterale
    canvas_obj.setFillColor(colors.HexColor("#3B82F6"))
    canvas_obj.rect(PAGE_W - 1.2*cm, 0, 1.2*cm, PAGE_H, fill=1, stroke=0)

    # testo
    canvas_obj.setFont("Helvetica-Bold", 48)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.drawString(MARGIN, PAGE_H - 5*cm, "Forecasto")

    canvas_obj.setFont("Helvetica", 18)
    canvas_obj.setFillColor(colors.HexColor("#BFDBFE"))
    canvas_obj.drawString(MARGIN, PAGE_H - 6.2*cm, "Manuale Utente")

    canvas_obj.setFont("Helvetica", 10)
    canvas_obj.setFillColor(colors.HexColor("#93C5FD"))
    canvas_obj.drawString(MARGIN, PAGE_H - 7.1*cm,
                          "Gestione previsioni di cassa e pianificazione finanziaria")

    canvas_obj.setFont("Helvetica", 9)
    canvas_obj.setFillColor(colors.HexColor("#93C5FD"))
    canvas_obj.drawString(MARGIN, 1.4*cm, "Versione 2026  |  uso interno")

    canvas_obj.restoreState()


# ─── PAGINE ──────────────────────────────────────────────────────────────────

def page_intro(story, S):
    story += section_header("Introduzione a Forecasto", S)

    story.append(Paragraph(
        "Forecasto è una piattaforma web per la <b>gestione previsionale della liquidità</b> "
        "aziendale. Permette di raccogliere in un unico sistema tutte le voci di entrata e "
        "uscita — dai budget di previsione alle fatture emesse — e di visualizzarne l'impatto "
        "sul cashflow nel tempo.",
        S["intro_lead"]
    ))

    story.append(Paragraph(
        "Il modello dati di Forecasto ruota attorno al concetto di <b>Voce</b>: un movimento "
        "finanziario caratterizzato da un importo, una data di incasso/pagamento prevista e "
        "uno stato. Le voci sono organizzate in quattro <b>Aree</b> che rispecchiano le fasi "
        "del ciclo finanziario aziendale — dall'opportunità commerciale all'incasso effettivo "
        "— e in <b>Workspace</b> annuali che separano i dati per esercizio o per società.",
        S["body"]
    ))

    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Concetti chiave", S["h2"]))

    concetti = [
        ("Workspace", "Contenitore annuale dei dati. Ogni workspace copre un esercizio fiscale e può avere più membri con ruoli e permessi diversi."),
        ("Area", "Le quattro categorie di voci (Budget, Prospect, Ordini, Actual) che corrispondono alle fasi del ciclo finanziario."),
        ("Voce (Record)", "Unità base: un movimento finanziario con conto, importo, data cashflow, IVA e stato."),
        ("Stage", "Stato binario (0/1) di una voce il cui significato varia per area: non pagato/pagato, non consegnato/consegnato, ecc."),
        ("Cashflow", "Proiezione temporale della liquidità, calcolata sommando le voci filtrate per area, stage e periodo."),
        ("Revisione Zero", "Modalità che aiuta a tenere sotto controllo le voci in stage 0 che richiedono un'azione o una data di revisione."),
    ]

    rows = [["Concetto", "Descrizione"]]
    for k, v in concetti:
        rows.append([
            Paragraph(k, S["label"]),
            Paragraph(v, S["body_small"])
        ])
    story.append(info_table(rows, [4*cm, PAGE_W - 2*MARGIN - 4*cm]))

    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Flusso di lavoro tipico", S["h2"]))
    story.append(Paragraph(
        "Il percorso naturale di una voce parte dal <b>Budget</b> (previsione annuale), "
        "passa per <b>Prospect</b> (trattativa commerciale aperta), poi per <b>Ordini</b> "
        "(impegni confermati ma non ancora fatturati) e infine arriva ad <b>Actual</b> "
        "(fatture emesse o ricevute). In ogni momento è possibile <i>trasferire</i> una "
        "voce all'area successiva, mantenendo la traccia della storia.",
        S["body"]
    ))

    # freccia stilizzata flusso
    flow_data = [
        ["Budget\n(Previsioni)", "→", "Prospect\n(Opportunità)", "→", "Ordini\n(Confermati)", "→", "Actual\n(Movimenti)"]
    ]
    flow_colors = [
        colors.HexColor("#7C3AED"), None, colors.HexColor("#2563EB"), None,
        colors.HexColor("#D97706"), None, colors.HexColor("#059669")
    ]
    flow_style = TableStyle([
        ("ALIGN",       (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME",    (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (0, 0), 9),
        ("FONTSIZE",    (2, 0), (2, 0), 9),
        ("FONTSIZE",    (4, 0), (4, 0), 9),
        ("FONTSIZE",    (6, 0), (6, 0), 9),
        ("FONTSIZE",    (1, 0), (1, 0), 14),
        ("FONTSIZE",    (3, 0), (3, 0), 14),
        ("FONTSIZE",    (5, 0), (5, 0), 14),
        ("TEXTCOLOR",   (0, 0), (0, 0), colors.HexColor("#7C3AED")),
        ("TEXTCOLOR",   (2, 0), (2, 0), BLUE_MED),
        ("TEXTCOLOR",   (4, 0), (4, 0), ORANGE),
        ("TEXTCOLOR",   (6, 0), (6, 0), ACCENT),
        ("TEXTCOLOR",   (1, 0), (1, 0), GREY_TEXT),
        ("TEXTCOLOR",   (3, 0), (3, 0), GREY_TEXT),
        ("TEXTCOLOR",   (5, 0), (5, 0), GREY_TEXT),
        ("TOPPADDING",  (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 10),
        ("BOX",         (0, 0), (0, 0), 1, colors.HexColor("#7C3AED")),
        ("BOX",         (2, 0), (2, 0), 1, BLUE_MED),
        ("BOX",         (4, 0), (4, 0), 1, ORANGE),
        ("BOX",         (6, 0), (6, 0), 1, ACCENT),
        ("ROUNDEDCORNERS", [4]),
    ])
    avail = PAGE_W - 2*MARGIN
    t = Table(flow_data,
              colWidths=[avail*0.22, avail*0.06, avail*0.22, avail*0.06,
                         avail*0.22, avail*0.06, avail*0.22 - 2],
              style=flow_style)
    story.append(Spacer(1, 0.3*cm))
    story.append(t)

    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph(
        "Le sezioni successive di questo manuale descrivono in dettaglio ciascuno degli "
        "elementi qui introdotti: le aree e i workspace, i campi delle voci, le funzioni "
        "della griglia, la modalità Revisione Zero, il pannello Cashflow e gli strumenti "
        "di importazione.",
        S["body"]
    ))

    story.append(PageBreak())


def page_aree_workspace(story, S):
    story += section_header("Le Quattro Aree e i Workspace", S)

    story.append(Paragraph("Le Quattro Aree", S["h2"]))
    story.append(Paragraph(
        "Ogni voce appartiene a una delle quattro aree. L'area determina il significato "
        "dello stage (stato) e il posizionamento della voce nel ciclo finanziario.",
        S["body"]
    ))

    aree = [
        ("#7C3AED", "BUDGET", "Previsioni",
         "Stage 0: Incerto  |  Stage 1: Probabile",
         "Raccoglie le previsioni annuali di entrata e uscita, tipicamente caricate a inizio "
         "esercizio. Serve come baseline per il confronto con i dati consuntivi."),
        ("#2563EB", "PROSPECT", "Opportunità",
         "Stage 0: Non approvato  |  Stage 1: Approvato",
         "Trattative commerciali in corso e opportunità da confermare. Permette di stimare "
         "i ricavi prima ancora che l'ordine sia formalizzato."),
        ("#D97706", "ORDINI", "Ordini Confermati",
         "Stage 0: Non consegnato  |  Stage 1: Consegnato",
         "Impegni formali ricevuti o emessi, non ancora fatturati. Rappresentano "
         "obbligazioni certe ma non ancora liquidate."),
        ("#059669", "ACTUAL", "Movimenti Effettivi",
         "Stage 0: Non pagato  |  Stage 1: Pagato",
         "Fatture emesse, ricevute e movimenti bancari reali. È l'area di consuntivo: "
         "qui finiscono tutte le voci una volta fatturate."),
    ]

    for hex_col, label, title, stages, desc in aree:
        col = colors.HexColor(hex_col)
        row_data = [[
            Paragraph(f"<b>{label}</b>", ParagraphStyle(
                "al", fontName="Helvetica-Bold", fontSize=9,
                textColor=WHITE, alignment=TA_CENTER
            )),
            Paragraph(f"<b>{title}</b>", ParagraphStyle(
                "at", fontName="Helvetica-Bold", fontSize=10, textColor=col
            )),
            Paragraph(desc, S["body_small"]),
            Paragraph(stages, ParagraphStyle(
                "as", fontName="Helvetica", fontSize=8,
                textColor=colors.HexColor("#6B7280"), italic=1
            )),
        ]]
        ts = TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), col),
            ("VALIGN",     (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING",   (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 8),
            ("BOX",        (0, 0), (-1, -1), 0.6, colors.HexColor("#E5E7EB")),
            ("LINEAFTER",  (0, 0), (0, -1), 0.4, colors.HexColor("#E5E7EB")),
        ])
        avail = PAGE_W - 2*MARGIN
        t = Table(row_data, colWidths=[1.5*cm, 3.5*cm, avail-9.5*cm, 4.5*cm],
                  style=ts, hAlign="LEFT")
        story.append(t)
        story.append(Spacer(1, 0.15*cm))

    story.append(Spacer(1, 0.3*cm))
    story.append(HRule(color=colors.HexColor("#E5E7EB")))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("I Workspace", S["h2"]))
    story.append(Paragraph(
        "Un workspace è il contenitore annuale dei dati finanziari. È possibile avere più "
        "workspace (ad esempio uno per esercizio o uno per società) e passare dall'uno "
        "all'altro dal selettore in alto a sinistra.",
        S["body"]
    ))

    ws_rows = [
        ["Componente", "Descrizione"],
        [Paragraph("<b>Nome</b>", S["label"]),
         "Identificativo del workspace (es. «Acme SRL 2026»)"],
        [Paragraph("<b>Anno Fiscale</b>", S["label"]),
         "Anno di riferimento dell'esercizio"],
        [Paragraph("<b>Descrizione</b>", S["label"]),
         "Note libere opzionali"],
        [Paragraph("<b>Conti Bancari</b>", S["label"]),
         "Conti associati al workspace, con saldo iniziale e fido. Ogni voce può essere "
         "collegata a un conto specifico."],
        [Paragraph("<b>Impostazioni</b>", S["label"]),
         "Configurazioni avanzate: P.IVA (per import SDI), mappature colonne Excel, "
         "mappature fornitori, timeout sessione."],
    ]
    story.append(info_table(ws_rows, [3.5*cm, PAGE_W - 2*MARGIN - 3.5*cm]))

    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Membri e Permessi", S["h2"]))
    story.append(Paragraph(
        "Ogni workspace può avere più membri. I permessi sono granulari per area e per "
        "segno (entrate/uscite).",
        S["body"]
    ))

    perm_rows = [
        ["Ruolo / Permesso", "Cosa consente"],
        [Paragraph("<b>Owner</b>", S["label"]),
         "Accesso completo: gestione membri, impostazioni, cancellazione workspace"],
        [Paragraph("<b>Admin</b>", S["label"]),
         "Gestione membri e impostazioni, accesso a tutte le aree"],
        [Paragraph("<b>Member</b>", S["label"]),
         "Accesso in lettura/scrittura alle aree concesse; permessi granulari configurabili"],
        [Paragraph("<b>Viewer</b>", S["label"]),
         "Solo lettura su tutte le aree visibili"],
        [Paragraph("<b>can_import / can_import_sdi</b>", S["label"]),
         "Abilita l'importazione da Excel/CSV o da fatture elettroniche XML"],
        [Paragraph("<b>can_export</b>", S["label"]),
         "Abilita l'esportazione CSV delle voci"],
    ]
    story.append(info_table(perm_rows, [4.5*cm, PAGE_W - 2*MARGIN - 4.5*cm]))

    story.append(PageBreak())


def page_campi_voci(story, S):
    story += section_header("I Campi delle Voci", S)
    story.append(Paragraph(
        "Una <b>Voce</b> (Record) è l'unità base di Forecasto. Ogni voce rappresenta un "
        "movimento finanziario previsto o effettivo, caratterizzato dai campi descritti "
        "di seguito.",
        S["body"]
    ))

    groups = [
        ("Identificazione", [
            ("Conto", "account", "Nome del cliente, fornitore o contropartita. Campo obbligatorio."),
            ("Riferimento", "reference", "Descrizione del movimento (causale, numero fattura, ecc.). Obbligatorio."),
            ("ID Transazione", "transaction_id", "Identificativo esterno univoco (codice banca, numero documento, UUID). Obbligatorio alla creazione."),
            ("Codice Progetto", "project_code", "Codice progetto o centro di costo. Facoltativo. Consente filtri e raggruppamenti per progetto."),
        ]),
        ("Importi", [
            ("Tipo (Entrata/Uscita)", "sign [UI]", "Selettore dell'interfaccia che determina il segno dell'importo: Entrata (+) o Uscita (−)."),
            ("Imponibile", "amount", "Importo netto, senza IVA. Positivo per entrate, negativo per uscite."),
            ("IVA %", "vat", "Aliquota IVA in percentuale (es. 22). Il campo Totale si aggiorna automaticamente."),
            ("Totale", "total", "Importo lordo (Imponibile × (1 + IVA%)). È il valore usato nel cashflow."),
            ("Detr. IVA %", "vat_deduction", "Percentuale di detraibilità IVA (0–100). Default 100%. Riduce la quota IVA recuperabile."),
        ]),
        ("Date", [
            ("Data Cashflow", "date_cashflow", "Data prevista del movimento di cassa. Campo obbligatorio. Determina la posizione nel grafico cashflow."),
            ("Data Offerta", "date_offer", "Data del documento (fattura, ordine, offerta). Se omessa, coincide con la Data Cashflow."),
            ("Prossima Revisione", "review_date", "Data entro la quale riesaminare la voce. Usata nella modalità Revisione Zero."),
        ]),
        ("Stato e Follow-up", [
            ("Stato", "stage", "Stage binario (0 o 1). Il significato dipende dall'area: es. in Actual = Non pagato / Pagato."),
            ("Responsabile", "owner", "Persona incaricata di gestire o seguire la voce. Testo libero."),
            ("Prossima Azione", "nextaction", "Descrizione dell'azione da compiere. Evidenziata in ambra nella vista dettaglio."),
            ("Conto Bancario", "bank_account_id", "Collega la voce a un conto bancario specifico del workspace."),
        ]),
        ("Note e Metadati", [
            ("Note", "note", "Campo libero in formato Markdown. Visualizzato con espandi/comprimi nella griglia."),
            ("Creato il / da", "created_at / creator", "Timestamp e utente di creazione. Sola lettura."),
            ("Modificato il / da", "updated_at / updater", "Timestamp e utente dell'ultima modifica. Sola lettura."),
            ("Cronologia Trasferimenti", "transfer_history", "Log automatico di tutti i trasferimenti di area, con data e nota."),
        ]),
    ]

    avail = PAGE_W - 2*MARGIN
    for group_title, fields in groups:
        story.append(Paragraph(group_title, S["h2"]))
        rows = [["Campo", "Chiave DB", "Descrizione"]]
        for label, key, desc in fields:
            rows.append([
                Paragraph(f"<b>{label}</b>", S["label"]),
                Paragraph(f"<i>{key}</i>", ParagraphStyle(
                    "mono", fontName="Courier", fontSize=7.5,
                    textColor=colors.HexColor("#6B7280")
                )),
                Paragraph(desc, S["body_small"]),
            ])
        story.append(info_table(rows, [3.5*cm, 3.2*cm, avail - 6.7*cm]))
        story.append(Spacer(1, 0.1*cm))

    story.append(PageBreak())


def page_funzioni_griglia(story, S):
    story += section_header("Funzioni della Griglia Voci", S)
    story.append(Paragraph(
        "La griglia è la vista principale di ogni area. Permette di visualizzare, filtrare, "
        "selezionare e operare sulle voci in modo efficiente.",
        S["body"]
    ))

    story.append(Paragraph("Visualizzazione e Navigazione", S["h2"]))

    nav_rows = [
        ["Funzione", "Descrizione"],
        [Paragraph("<b>Ordina per colonna</b>", S["label"]),
         "Clic sull'intestazione di colonna per ordinare crescente/decrescente. Colonne disponibili: N., Area, Stato, Data, Conto, Riferimento, ID, Responsabile, Progetto, Imponibile, Totale."],
        [Paragraph("<b>Dimensione pagina</b>", S["label"]),
         "Selettore 50 / 100 / 500 / Tutti. Default 100. Navigazione tra le pagine con i pulsanti freccia."],
        [Paragraph("<b>Vista compatta / estesa</b>", S["label"]),
         "Modalità compatta: testo troncato con ellissi. Modalità estesa: testo a capo per leggere contenuti lunghi."],
        [Paragraph("<b>Colonne visibili</b>", S["label"]),
         "Selettore per mostrare/nascondere: N. sequenziale, Responsabile, Codice Progetto, Area (solo in vista multi-area)."],
        [Paragraph("<b>Evidenziazioni</b>", S["label"]),
         "Scaduto (sfondo arancione): stage 0 con data cashflow ≤ oggi. Selezionato: grigio. Visitato: tinta leggera. Eliminato: opacità ridotta."],
    ]
    story.append(info_table(nav_rows, [3.8*cm, PAGE_W - 2*MARGIN - 3.8*cm]))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Selezione e Operazioni Massive", S["h2"]))
    story.append(Paragraph(
        "Spuntare il checkbox di una o più righe attiva la <b>barra di azioni massive</b> "
        "in fondo alla pagina. Le operazioni disponibili sono:",
        S["body"]
    ))

    ops = [
        ("Elimina", "Elimina (soft-delete) le voci selezionate dopo conferma."),
        ("Unisci", "Unisce 2+ voci in una sola, sommando gli importi e unendo le note. Richiede almeno 2 record."),
        ("Sposta Date", "Sposta la Data Cashflow di N giorni su tutta la selezione (positivo = avanti, negativo = indietro)."),
        ("Imposta Giorno", "Imposta il giorno del mese della Data Cashflow su un valore fisso (es. fine mese = 28)."),
        ("Cambia Stage", "Imposta lo stage a 0 o 1 su tutta la selezione in un'unica operazione."),
        ("Trasferisci", "Sposta le voci in un'altra area del workflow (es. da Ordini ad Actual), con nota facoltativa."),
        ("Sposta in altro Workspace", "Trasferisce le voci selezionate in un workspace diverso."),
        ("Dividi in Rate", "Dalla voce selezionata (1 sola) genera N rate mensili di importo proporzionale."),
        ("Clona", "Duplica la voce selezionata (1 sola) con tutti i campi originali."),
        ("Modifica Massiva", "Apre un pannello per modificare simultaneamente gli stessi campi su tutte le voci selezionate."),
        ("Esporta CSV", "Scarica le voci selezionate in formato CSV (separatore punto e virgola)."),
    ]

    op_rows = [["Operazione", "Descrizione"]]
    for op, desc in ops:
        op_rows.append([
            Paragraph(f"<b>{op}</b>", S["label"]),
            Paragraph(desc, S["body_small"]),
        ])
    story.append(info_table(op_rows, [3.8*cm, PAGE_W - 2*MARGIN - 3.8*cm]))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Riga di Totale", S["h2"]))
    story.append(Paragraph(
        "In fondo alla griglia è sempre presente una riga di riepilogo con i totali di "
        "<b>Imponibile</b> e <b>Totale</b> per tutti i record visualizzati. "
        "Quando sono presenti record selezionati, la riga mostra anche il conteggio "
        "e i subtotali della selezione.",
        S["body"]
    ))

    story.append(PageBreak())


def page_revisione_zero(story, S):
    story += section_header("La Revisione Zero", S)

    story.append(Paragraph(
        "La <b>Revisione Zero</b> è una modalità operativa di Forecasto pensata per "
        "tenere sotto controllo le voci in <b>stage 0</b> (non ancora completate) che "
        "richiedono attenzione periodica. «Zero» si riferisce sia allo stage 0 sia "
        "all'obiettivo di portare a zero le voci in attesa di revisione.",
        S["intro_lead"]
    ))

    story.append(Paragraph("Attivazione", S["h2"]))
    story.append(Paragraph(
        "La modalità si attiva con il pulsante <b>Revisione Zero</b> presente nella "
        "barra superiore della griglia. Una volta attiva, vengono mostrati filtri "
        "e controlli aggiuntivi specifici per questa modalità.",
        S["body"]
    ))

    story.append(Paragraph("Filtri Disponibili in Modalità Revisione", S["h2"]))

    filtri_rows = [
        ["Filtro", "Opzioni", "Effetto"],
        [Paragraph("<b>Scadute</b>", S["label"]),
         "Tutte / Sì / No",
         Paragraph("Filtra le voci in base allo stato della <i>Prossima Revisione</i>: «Sì» mostra solo le voci con data di revisione passata (scaduta), «No» mostra quelle non ancora scadute.", S["body_small"])],
        [Paragraph("<b>Prossima Azione</b>", S["label"]),
         "Tutte / Con azione / Senza azione",
         Paragraph("Filtra in base alla presenza o assenza del campo <i>Prossima Azione</i>, permettendo di isolare le voci che richiedono un intervento definito.", S["body_small"])],
    ]
    story.append(info_table(filtri_rows, [3.5*cm, 3.5*cm, PAGE_W - 2*MARGIN - 7*cm]))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Azioni di Revisione", S["h2"]))
    story.append(Paragraph(
        "Nel pannello di modifica di una voce, quando la modalità Revisione Zero è attiva, "
        "compaiono due pulsanti rapidi per aggiornare la data di revisione:",
        S["body"]
    ))

    azioni_rows = [
        ["Pulsante", "Comportamento"],
        [Paragraph("<b>Rivedi 7gg</b>", S["label"]),
         "Imposta la Prossima Revisione a oggi + 7 giorni e salva la voce immediatamente."],
        [Paragraph("<b>Rivedi 15gg</b>", S["label"]),
         "Imposta la Prossima Revisione a oggi + 15 giorni e salva la voce immediatamente."],
    ]
    story.append(info_table(azioni_rows, [3.5*cm, PAGE_W - 2*MARGIN - 3.5*cm]))

    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Casi d'Uso Tipici", S["h2"]))

    casi = [
        ("Sollecito pagamenti", "Le fatture emesse (Actual, stage 0 = Non pagato) vengono monitorate con data di revisione ricorrente. Ogni 7 o 15 giorni si aggiorna la data dopo il sollecito al cliente."),
        ("Rinnovi contrattuali", "Ordini in scadenza vengono segnalati con Prossima Azione = «Verificare rinnovo» e una data di revisione prima della scadenza."),
        ("Conferma ordini aperti", "Prospect o Ordini con stage 0 che attendono conferma dal cliente vengono tenuti in lista revisione fino all'aggiornamento dello stato."),
        ("Compliance periodica", "Voci di adempimenti ricorrenti (affitti, assicurazioni, utenze) vengono ripianificate automaticamente con la revisione a 15 o 30 giorni."),
    ]

    casi_rows = [["Scenario", "Come si usa Revisione Zero"]]
    for titolo, desc in casi:
        casi_rows.append([
            Paragraph(f"<b>{titolo}</b>", S["label"]),
            Paragraph(desc, S["body_small"])
        ])
    story.append(info_table(casi_rows, [4*cm, PAGE_W - 2*MARGIN - 4*cm]))

    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph("Integrazione con gli Altri Campi", S["h2"]))
    story.append(Paragraph(
        "La modalità Revisione Zero non altera i dati della voce: agisce esclusivamente "
        "sul campo <b>Prossima Revisione</b> e sul campo <b>Prossima Azione</b>. "
        "Questi campi sono visibili anche al di fuori della modalità, nel pannello di "
        "dettaglio della voce, dove la Prossima Azione appare evidenziata in <b>ambra</b> "
        "per richiamare l'attenzione dell'operatore.",
        S["body"]
    ))

    story.append(PageBreak())


def page_cashflow(story, S):
    story += section_header("Il Pannello Cashflow", S)
    story.append(Paragraph(
        "La sezione <b>Cashflow</b> di Forecasto è la proiezione temporale della liquidità "
        "aziendale. Aggrega le voci selezionate per area e periodo, calcola i saldi progressivi "
        "e visualizza l'andamento in un grafico interattivo.",
        S["body"]
    ))

    story.append(Paragraph("Parametri di Configurazione", S["h2"]))
    params_rows = [
        ["Parametro", "Descrizione"],
        [Paragraph("<b>Intervallo date</b>", S["label"]),
         "Data di inizio e fine del periodo di analisi. Obbligatorio."],
        [Paragraph("<b>Aree incluse</b>", S["label"]),
         "Selezione multipla: Budget, Prospect, Ordini, Actual. Consente di confrontare scenari (es. solo Actual vs Actual + Ordini)."],
        [Paragraph("<b>Filtro Area:Stage</b>", S["label"]),
         "Formato «area:stage» (es. «actual:0», «orders:1»). Permette di includere solo le voci con uno stage specifico per ogni area."],
        [Paragraph("<b>Raggruppa per</b>", S["label"]),
         "Granularità del grafico: Giorno, Settimana, Mese."],
        [Paragraph("<b>Conto Bancario</b>", S["label"]),
         "Filtro facoltativo per vedere il cashflow di un singolo conto corrente."],
        [Paragraph("<b>Codice Progetto</b>", S["label"]),
         "Filtro facoltativo per analizzare il flusso di cassa di un progetto specifico."],
    ]
    story.append(info_table(params_rows, [4*cm, PAGE_W - 2*MARGIN - 4*cm]))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Metriche Riepilogative", S["h2"]))
    story.append(Paragraph(
        "Le card nella parte superiore del pannello mostrano i valori aggregati del periodo:",
        S["body"]
    ))

    metr_rows = [
        ["Metrica", "Calcolo"],
        [Paragraph("<b>Saldo Iniziale</b>", S["label"]),
         "Saldo di apertura dei conti bancari associati al workspace all'inizio del periodo."],
        [Paragraph("<b>Entrate Previste</b>", S["label"]),
         "Somma di tutti i movimenti positivi (Totale) nel periodo selezionato."],
        [Paragraph("<b>Uscite Previste</b>", S["label"]),
         "Somma di tutti i movimenti negativi (Totale) nel periodo selezionato (valore assoluto)."],
        [Paragraph("<b>Saldo Finale</b>", S["label"]),
         "Saldo Iniziale + Entrate Previste − Uscite Previste."],
        [Paragraph("<b>Saldo Minimo</b>", S["label"]),
         "Punto più basso del saldo progressivo nel periodo, con la data corrispondente."],
    ]
    story.append(info_table(metr_rows, [4*cm, PAGE_W - 2*MARGIN - 4*cm]))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Grafico e Drill-down", S["h2"]))
    story.append(Paragraph(
        "Il grafico a barre mostra entrate e uscite per ogni periodo (giorno/settimana/mese), "
        "con una linea sovrapposta che rappresenta il <b>saldo progressivo</b>. "
        "Cliccando su una barra si apre il pannello di <b>drill-down</b>: una lista "
        "dettagliata di tutte le voci che contribuiscono a quel periodo, con la possibilità "
        "di aprire e modificare ogni singola voce.",
        S["body"]
    ))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Tabella di Dettaglio e Snapshot", S["h2"]))

    det_rows = [
        ["Funzione", "Descrizione"],
        [Paragraph("<b>Tabella periodo</b>", S["label"]),
         "Sezione espandibile con una riga per ciascun periodo: Data, Entrate, Uscite, Netto, Saldo Progressivo."],
        [Paragraph("<b>Esporta CSV</b>", S["label"]),
         "Pulsante che scarica la tabella di dettaglio in formato CSV (separatore «;»)."],
        [Paragraph("<b>Balance Snapshot</b>", S["label"]),
         "Permette di registrare il saldo bancario reale in una data specifica. "
         "Quando è presente uno snapshot, il saldo progressivo riparte da quel valore, "
         "ricalibrandosi con i dati effettivi. Utile per la riconciliazione bancaria."],
    ]
    story.append(info_table(det_rows, [3.8*cm, PAGE_W - 2*MARGIN - 3.8*cm]))

    story.append(PageBreak())


def page_importazione(story, S):
    story += section_header("Le Funzioni di Importazione", S)
    story.append(Paragraph(
        "Forecasto offre tre modalità di importazione per caricare voci in blocco. "
        "Tutte richiedono il permesso <b>can_import</b> o <b>can_import_sdi</b> "
        "configurato nelle impostazioni del workspace.",
        S["body"]
    ))

    # IMPORT EXCEL/CSV
    story.append(Paragraph("1 — Importazione Excel / CSV", S["h2"]))
    story.append(Paragraph(
        "Procedura guidata multi-step per importare file <b>.xlsx</b>, <b>.xls</b> "
        "e <b>.csv</b>. Accessibile dal menù Importa nella barra degli strumenti.",
        S["body"]
    ))

    xls_rows = [
        ["Fase", "Descrizione"],
        [Paragraph("<b>1. Selezione file</b>", S["label"]),
         "Trascina il file nella finestra o usa il selettore. Formati accettati: .xlsx, .xls, .csv."],
        [Paragraph("<b>2. Scelta area</b>", S["label"]),
         "Seleziona l'area di destinazione (Budget, Prospect, Ordini, Actual)."],
        [Paragraph("<b>3. Mappatura colonne</b>", S["label"]),
         "Abbina ogni colonna del file al campo Forecasto corrispondente. "
         "Il sistema suggerisce automaticamente le corrispondenze in base al nome della colonna. "
         "La mappatura viene memorizzata e riutilizzata automaticamente al prossimo import dello stesso formato."],
        [Paragraph("<b>4. Modalità importo</b>", S["label"]),
         "Colonna singola: un unico campo importo (il segno determina entrata/uscita). "
         "Colonne separate: una colonna Entrate e una Uscite."],
        [Paragraph("<b>5. Anteprima</b>", S["label"]),
         "Mostra le prime righe con indicatori colorati: verde (ok), rosso (errore), giallo (avviso). "
         "Consente di correggere prima di procedere."],
        [Paragraph("<b>6. Importazione</b>", S["label"]),
         "Barra di avanzamento. Al termine: riepilogo con conteggio successi, errori e dettaglio righe fallite."],
    ]
    story.append(info_table(xls_rows, [3.5*cm, PAGE_W - 2*MARGIN - 3.5*cm]))

    story.append(Paragraph(
        "<b>Campi mappabili:</b> date_cashflow, reference, amount / total / vat_amount / "
        "vat_percent / amount_in / amount_out, account, date_offer, note, owner, "
        "project_code, transaction_id, stage.",
        S["body_small"]
    ))

    story.append(Spacer(1, 0.3*cm))

    # IMPORT SDI
    story.append(Paragraph("2 — Importazione Fatture Elettroniche (SDI / FatturaPA)", S["h2"]))
    story.append(Paragraph(
        "Importatore specializzato per fatture elettroniche italiane in formato XML "
        "(FatturaPA). Supporta upload multiplo di file <b>.xml</b> in un'unica operazione. "
        "Richiede il permesso <b>can_import_sdi</b> e la <b>P.IVA del workspace</b> "
        "configurata nelle impostazioni.",
        S["body"]
    ))

    sdi_rows = [
        ["Funzione", "Descrizione"],
        [Paragraph("<b>Classificazione automatica</b>", S["label"]),
         "Il sistema confronta la P.IVA del cedente/cessionario con quella del workspace. "
         "Se la P.IVA del workspace è quella del cessionario → fattura passiva. "
         "Se è quella del cedente → fattura attiva."],
        [Paragraph("<b>Suddivisione in rate</b>", S["label"]),
         "Fatture con più scadenze di pagamento vengono automaticamente suddivise in "
         "tante righe quante le rate, ciascuna con la propria data e importo."],
        [Paragraph("<b>Riconoscimento fornitori</b>", S["label"]),
         "P.IVA e denominazione già incontrate in precedenti import vengono riconosciute "
         "automaticamente, precompilando conto, detraibilità IVA e altri campi ricorrenti."],
        [Paragraph("<b>Anteprima avanzata</b>", S["label"]),
         "Mostra badge «nuovo fornitore» per contropartite nuove, segnala duplicati "
         "(stessa fattura già importata) e consente di editare data cashflow, conto "
         "e detraibilità IVA prima di confermare."],
        [Paragraph("<b>Campi estratti</b>", S["label"]),
         "Numero e data fattura, tipo (attiva/passiva), denominazione e P.IVA "
         "contropartita, imponibile, IVA, totale, scadenze di pagamento."],
    ]
    story.append(info_table(sdi_rows, [3.8*cm, PAGE_W - 2*MARGIN - 3.8*cm]))

    story.append(Spacer(1, 0.3*cm))

    # IMPORT JSON
    story.append(Paragraph("3 — Importazione JSON (Backup / Migrazione)", S["h2"]))
    story.append(Paragraph(
        "Importazione diretta da file <b>.json</b> per scenari di backup, migrazione "
        "da altri sistemi o caricamento programmatico. Il file deve contenere un array "
        "di oggetti con i campi Forecasto.",
        S["body"]
    ))

    json_rows = [
        ["Campo obbligatorio", "Valori accettati"],
        [Paragraph("<b>type</b>", S["label"]), "\"0\" = Actual, \"1\" = Ordini, \"2\" = Prospect, \"3\" = Budget"],
        [Paragraph("<b>account</b>", S["label"]), "Testo libero (conto / contropartita)"],
        [Paragraph("<b>reference</b>", S["label"]), "Testo libero (causale / riferimento)"],
        [Paragraph("<b>date_cashflow</b>", S["label"]), "Formato YYYY-MM-DD"],
        [Paragraph("<b>amount</b>", S["label"]), "Numero decimale (positivo = entrata, negativo = uscita)"],
        [Paragraph("<b>total</b>", S["label"]), "Numero decimale (lordo IVA)"],
    ]
    story.append(info_table(json_rows, [4*cm, PAGE_W - 2*MARGIN - 4*cm]))
    story.append(Paragraph(
        "Valori di default applicati se assenti: IVA = 22%, Detr. IVA = 100%, "
        "Stage = 0, transaction_id = generato automaticamente.",
        S["body_small"]
    ))

    story.append(PageBreak())


# ─── MAIN ────────────────────────────────────────────────────────────────────
def build_manual(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=2.2*cm,
        title="Forecasto — Manuale Utente",
        author="Forecasto",
    )

    S = make_styles()
    story = []

    # Copertina
    story.append(Spacer(1, 1*cm))  # placeholder; la copertina è disegnata on_first_page

    # Le funzioni di pagina
    page_intro(story, S)
    page_aree_workspace(story, S)
    page_campi_voci(story, S)
    page_funzioni_griglia(story, S)
    page_revisione_zero(story, S)
    page_cashflow(story, S)
    page_importazione(story, S)

    # Copertina come prima pagina speciale
    doc.build(
        story,
        onFirstPage=lambda c, d: (build_cover(c, d), add_page_number(c, d)),
        onLaterPages=add_page_number,
    )
    print(f"Manuale generato: {output_path}")


if __name__ == "__main__":
    build_manual("/Users/cashbit/dev/forecasto/forecasto-manuale-utente.pdf")
