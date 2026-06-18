#!/usr/bin/env python3
"""
Forecasto Fatture Passive - Estrazione Rapida
Estrae dati essenziali da fatture elettroniche XML passive per import su Forecasto
Con mapping account automatico TechMakers e gestione AMEX
"""

import xml.etree.ElementTree as ET
import json
import sys
import re
from pathlib import Path
from datetime import datetime, timedelta

# Mapping account TechMakers per fornitori noti
ACCOUNT_MAPPING = {
    # Collaboratori
    "FRANZA": "COLLABORATORE",
    "FOSSA": "COLLABORATORE",
    "LANZA": "COLLABORATORE",
    # Ristorazione
    "FASSONERIA": "RISTORAZIONE",
    "MUTTNIK": "RISTORAZIONE",
    "RISTORANTE": "RISTORAZIONE",
    "PIZZERIA": "RISTORAZIONE",
    "BAR ": "RISTORAZIONE",
    "TRATTORIA": "RISTORAZIONE",
    # Bollette
    "DUFERCO": "BOLLETTE",
    "ENEL": "BOLLETTE",
    "ENI ": "BOLLETTE",
    "SIAD ": "BOLLETTE",
    "GAS ": "BOLLETTE",
    "ACQUA": "BOLLETTE",
    "ENEL X": "BOLLETTE",
    # Telecomunicazioni
    "WIND": "ABBONAMENTO",
    "TRE": "ABBONAMENTO",
    "FIBRA FORTE": "ABBONAMENTO",
    "TELECOM": "ABBONAMENTO",
    "VODAFONE": "ABBONAMENTO",
    "TIM": "ABBONAMENTO",
    # Cloud e servizi
    "GOOGLE": "ABBONAMENTO",
    "MICROSOFT": "ABBONAMENTO",
    "AMAZON": "ACQUISTO MERCI",
    "AWS": "ABBONAMENTO",
    "PARTICLE": "ABBONAMENTO",
    "IONOS": "ABBONAMENTO",
    "ZEROTIER": "ABBONAMENTO",
    "SENDGRID": "ABBONAMENTO",
    "1NCE": "ABBONAMENTO",
    # Hardware
    "DIGI-KEY": "ACQUISTO MERCI",
    "MOUSER": "ACQUISTO MERCI",
    "RS COMPONENTS": "ACQUISTO MERCI",
    "DISTRELEC": "ACQUISTO MERCI",
    # Ufficio
    "CAMPI 2004": "AFFITTO",
    # Consulenze
    "ALONGI": "CONSULENZA",
    "COMMERCIALISTA": "CONSULENZA",
    "NOTAIO": "CONSULENZA",
    "AVVOCATO": "CONSULENZA",
    # Spedizioni
    "DHL": "SPEDIZIONI",
    "UPS": "SPEDIZIONI",
    "POSTE": "SPEDIZIONI",
    "BRT": "SPEDIZIONI",
    "GLS": "SPEDIZIONI",
    # Viaggi
    "HERTZ": "SPESE VIAGGIO",
    "AVIS": "SPESE VIAGGIO",
    "EUROPCAR": "SPESE VIAGGIO",
    "TRENITALIA": "SPESE VIAGGIO",
    "ITALO": "SPESE VIAGGIO",
    "AUTOSTRADE": "SPESE VIAGGIO",
}

# Fornitori AMEX (pagamento il 12 del mese successivo)
AMEX_SUPPLIERS = [
    "AMAZON",
    "DIGI-KEY",
    "1NCE",
    "FLOAT",
    "ZEROTIER",
    "SENDGRID",
    "ENEL X",
]


def extract_text(element, path, default=""):
    """Estrae testo da un elemento XML con gestione errori"""
    try:
        found = element.find(path)
        return found.text.strip() if found is not None and found.text else default
    except:
        return default


def get_amex_date(data_fattura):
    """Calcola data addebito AMEX (12 del mese successivo)"""
    try:
        dt = datetime.strptime(data_fattura, "%Y-%m-%d")
        # Vai al mese successivo
        if dt.month == 12:
            next_month = datetime(dt.year + 1, 1, 12)
        else:
            next_month = datetime(dt.year, dt.month + 1, 12)
        return next_month.strftime("%Y-%m-%d")
    except:
        return data_fattura


def is_amex_supplier(fornitore):
    """Verifica se il fornitore è pagato con AMEX"""
    fornitore_upper = fornitore.upper()
    for supplier in AMEX_SUPPLIERS:
        if supplier in fornitore_upper:
            return True
    return False


def get_account(fornitore, descrizione=""):
    """Determina l'account TechMakers in base al fornitore"""
    search_text = f"{fornitore} {descrizione}".upper()
    
    for pattern, account in ACCOUNT_MAPPING.items():
        if pattern.upper() in search_text:
            return account
    
    # Default
    return "CONSULENZA"


def extract_fornitore(root):
    """Estrae dati fornitore (cedente/prestatore)"""
    cedente_elem = root.find('.//CedentePrestatore')
    if cedente_elem is None:
        return {"denominazione": "SCONOSCIUTO", "piva": "", "cf": ""}
    
    denominazione = extract_text(cedente_elem, './/Denominazione')
    if not denominazione:
        # Prova con Nome + Cognome per persone fisiche
        nome = extract_text(cedente_elem, './/Nome')
        cognome = extract_text(cedente_elem, './/Cognome')
        if nome or cognome:
            denominazione = f"{cognome} {nome}".strip()
    
    piva = extract_text(cedente_elem, './/IdFiscaleIVA/IdCodice')
    cf = extract_text(cedente_elem, './/CodiceFiscale')
    paese = extract_text(cedente_elem, './/IdFiscaleIVA/IdPaese', "IT")
    
    return {
        "denominazione": denominazione.strip().upper() if denominazione else "SCONOSCIUTO",
        "piva": f"{paese}{piva}" if piva else "",
        "cf": cf
    }


def extract_importi(root):
    """Estrae importi principali della fattura"""
    body = root.find('.//FatturaElettronicaBody')
    if body is None:
        return {"imponibile": "0.00", "aliquota_iva": "22", "iva": "0.00", "totale": "0.00"}
    
    # Prova con DatiRiepilogo (più affidabile)
    riepilogo = body.find('.//DatiBeniServizi/DatiRiepilogo')
    if riepilogo is not None:
        imponibile = extract_text(riepilogo, './/ImponibileImporto', "0")
        iva = extract_text(riepilogo, './/Imposta', "0")
        aliquota = extract_text(riepilogo, './/AliquotaIVA', "22")
    else:
        # Fallback: calcola da righe dettaglio
        righe = body.findall('.//DatiBeniServizi/DettaglioLinee')
        imponibile = sum(float(extract_text(r, './/PrezzoTotale', "0")) for r in righe)
        aliquota = extract_text(righe[0] if righe else None, './/AliquotaIVA', "22") if righe else "22"
        iva = imponibile * float(aliquota) / 100
    
    # Totale documento
    totale = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/ImportoTotaleDocumento')
    if not totale:
        totale = str(float(imponibile) + float(iva))
    
    # Rimuovi percentuale dall'aliquota se presente
    aliquota_str = str(aliquota).replace('%', '').replace(',', '.').strip()
    try:
        aliquota_float = float(aliquota_str)
        # Se > 100, probabilmente errore di parsing
        if aliquota_float > 100:
            aliquota_float = 22
        aliquota_str = str(int(aliquota_float)) if aliquota_float == int(aliquota_float) else str(aliquota_float)
    except:
        aliquota_str = "22"
    
    return {
        "imponibile": f"{float(imponibile):.2f}",
        "aliquota_iva": aliquota_str,
        "iva": f"{float(iva):.2f}",
        "totale": f"{float(totale):.2f}"
    }


def extract_descrizione(root):
    """Estrae descrizione servizi (concatena prime righe dettaglio)"""
    body = root.find('.//FatturaElettronicaBody')
    if body is None:
        return "Servizi/prodotti"
    
    righe = body.findall('.//DatiBeniServizi/DettaglioLinee/Descrizione')
    if righe:
        # Prendi le prime 3 descrizioni
        descrizioni = [r.text.strip() for r in righe[:3] if r.text]
        return "; ".join(descrizioni)[:200]  # Max 200 char
    
    # Fallback: causale
    causale = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/Causale')
    return causale if causale else "Servizi/prodotti"


def extract_scadenza(root):
    """Estrae data scadenza pagamento"""
    body = root.find('.//FatturaElettronicaBody')
    if body is None:
        return None
    
    # Prima prova DettaglioPagamento
    scadenza = extract_text(body, './/DatiPagamento/DettaglioPagamento/DataScadenzaPagamento')
    if scadenza:
        return scadenza
    
    # Altrimenti usa data documento + 30 giorni
    data_doc = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/Data')
    if data_doc:
        try:
            dt = datetime.strptime(data_doc, "%Y-%m-%d")
            return (dt + timedelta(days=30)).strftime("%Y-%m-%d")
        except:
            pass
    
    return None


def extract_rate(root):
    """Estrae rate di pagamento multiple"""
    body = root.find('.//FatturaElettronicaBody')
    if body is None:
        return None
    
    rate_elements = body.findall('.//DatiPagamento/DettaglioPagamento')
    
    if not rate_elements or len(rate_elements) <= 1:
        return None
    
    rate = []
    for idx, rata in enumerate(rate_elements, 1):
        importo = extract_text(rata, './/ImportoPagamento', "0")
        scadenza = extract_text(rata, './/DataScadenzaPagamento', "")
        
        rate.append({
            "numero": idx,
            "importo": f"{float(importo):.2f}",
            "scadenza": scadenza
        })
    
    return rate


def extract_modalita_pagamento(root):
    """Estrae modalità pagamento"""
    body = root.find('.//FatturaElettronicaBody')
    if body is None:
        return None
    
    # Codice modalità pagamento FatturaPA
    mp_codes = {
        "MP01": "Contanti",
        "MP02": "Assegno",
        "MP05": "Bonifico",
        "MP08": "Bancomat",
        "MP12": "RIBA",
        "MP19": "SDD",
        "MP21": "MAV",
        "MP22": "PagoPA",
    }
    
    mp = extract_text(body, './/DatiPagamento/DettaglioPagamento/ModalitaPagamento')
    return mp_codes.get(mp, mp) if mp else None


def extract_iban_fornitore(root):
    """Estrae IBAN del fornitore"""
    body = root.find('.//FatturaElettronicaBody')
    if body is None:
        return None
    return extract_text(body, './/DatiPagamento/DettaglioPagamento/IBAN') or None


def extract_fattura(xml_file):
    """Estrae tutti i dati necessari da una fattura XML passiva"""
    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()
        
        body = root.find('.//FatturaElettronicaBody')
        if body is None:
            raise ValueError("Struttura FatturaElettronicaBody non trovata")
        
        # Estrai campi principali
        numero = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/Numero')
        data_emissione = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/Data')
        tipo_doc = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/TipoDocumento', "TD01")
        
        fornitore = extract_fornitore(root)
        importi = extract_importi(root)
        descrizione = extract_descrizione(root)
        scadenza = extract_scadenza(root)
        rate = extract_rate(root)
        modalita_pag = extract_modalita_pagamento(root)
        iban = extract_iban_fornitore(root)
        
        # Determina account TechMakers
        account = get_account(fornitore["denominazione"], descrizione)
        
        # Verifica se fornitore AMEX
        is_amex = is_amex_supplier(fornitore["denominazione"])
        
        # Calcola date_cashflow per Forecasto
        if is_amex:
            date_cashflow = get_amex_date(data_emissione)
        elif scadenza:
            date_cashflow = scadenza
        elif data_emissione:
            date_cashflow = data_emissione
        else:
            date_cashflow = ""
        
        # Prepara output per Forecasto (importi NEGATIVI!)
        forecasto = {
            "account": account,
            "reference": fornitore["denominazione"],
            "transaction": f"FATT {numero} - {descrizione[:50]}",
            "transaction_id": f"FATT_{fornitore['denominazione'].split()[0]}_{numero}_{data_emissione[:4] if data_emissione else '2025'}",
            "date_offer": data_emissione,
            "date_cashflow": date_cashflow,
            "amount": f"-{importi['imponibile']}",
            "vat": importi["aliquota_iva"],
            "total": f"-{importi['totale']}",
            "stage": "0",
            "is_amex": is_amex,
            "commissione_suggerita": None if is_amex else "-0.75"  # Bonifico
        }
        
        # Se SDD, commissione diversa
        if modalita_pag == "SDD":
            forecasto["commissione_suggerita"] = "-0.70"
        
        return {
            "file": Path(xml_file).name,
            "tipo_documento": tipo_doc,
            "numero": numero,
            "data_emissione": data_emissione,
            "fornitore": fornitore,
            "importi": importi,
            "descrizione": descrizione,
            "scadenza_originale": scadenza,
            "rate": rate,
            "modalita_pagamento": modalita_pag,
            "iban_fornitore": iban,
            "forecasto": forecasto,
            "success": True
        }
        
    except Exception as e:
        return {
            "file": Path(xml_file).name,
            "error": str(e),
            "success": False
        }


def main():
    if len(sys.argv) < 2:
        print("Uso: python extract_fatture_passive.py <file1.xml> [file2.xml] [...]", file=sys.stderr)
        sys.exit(1)
    
    risultati = []
    errori = []
    
    for xml_file in sys.argv[1:]:
        result = extract_fattura(xml_file)
        
        if result["success"]:
            risultati.append(result)
        else:
            errori.append(result)
            print(f"ERRORE elaborando {result['file']}: {result['error']}", file=sys.stderr)
    
    # Output JSON compatto
    print(json.dumps(risultati, indent=2, ensure_ascii=False))
    
    # Statistiche su stderr
    print(f"\n✅ Elaborate {len(risultati)} fatture passive con successo", file=sys.stderr)
    if errori:
        print(f"❌ {len(errori)} errori durante l'elaborazione", file=sys.stderr)
    
    # Statistiche AMEX
    amex_count = sum(1 for r in risultati if r.get("forecasto", {}).get("is_amex"))
    if amex_count:
        print(f"💳 {amex_count} fatture AMEX (date_cashflow al 12 mese successivo)", file=sys.stderr)
    
    # Exit code: 0 se almeno una fattura OK, 1 se tutte fallite
    sys.exit(0 if risultati else 1)


if __name__ == "__main__":
    main()
