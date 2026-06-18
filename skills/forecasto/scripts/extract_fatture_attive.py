#!/usr/bin/env python3
"""
Forecasto Fatture Attive - Estrazione Rapida
Estrae dati essenziali da fatture elettroniche XML per import su Forecasto
"""

import xml.etree.ElementTree as ET
import json
import sys
import re
from pathlib import Path

# Namespace FatturaPA - usato solo per root
NS = {'p': 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2'}

def extract_text(element, path, default=""):
    """Estrae testo da un elemento XML con gestione errori"""
    try:
        found = element.find(path)
        return found.text if found is not None else default
    except:
        return default

def extract_cliente(root):
    """Estrae dati cliente (cessionario/committente)"""
    cliente_elem = root.find('.//CessionarioCommittente')
    if cliente_elem is None:
        return {"denominazione": "SCONOSCIUTO", "piva": ""}
    
    denominazione = extract_text(cliente_elem, './/Denominazione')
    piva = extract_text(cliente_elem, './/IdFiscaleIVA/IdCodice')
    
    return {
        "denominazione": denominazione.strip(),
        "piva": f"IT{piva}" if piva and not piva.startswith("IT") else piva
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
    totale = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/ImportoTotaleDocumento', str(float(imponibile) + float(iva)))
    
    return {
        "imponibile": f"{float(imponibile):.2f}",
        "aliquota_iva": aliquota,
        "iva": f"{float(iva):.2f}",
        "totale": f"{float(totale):.2f}"
    }

def extract_descrizione(root):
    """Estrae descrizione servizi (da prima riga dettaglio)"""
    body = root.find('.//FatturaElettronicaBody')
    if body is None:
        return "Servizi professionali"
    
    prima_riga = body.find('.//DatiBeniServizi/DettaglioLinee/Descrizione')
    if prima_riga is not None:
        return prima_riga.text.strip()
    
    # Fallback: causale
    causale = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/Causale')
    return causale if causale else "Servizi professionali"

def extract_riferimento_offerta(root):
    """Cerca pattern offerta tipo 7258_V0_2025 nella descrizione"""
    descrizione = extract_descrizione(root)
    body = root.find('.//FatturaElettronicaBody')
    causale = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/Causale') if body is not None else ""
    testo_completo = f"{descrizione} {causale}"
    
    # Pattern: numero_V[versione]_anno
    match = re.search(r'\b(\d{4})_V\d+_\d{4}\b', testo_completo)
    if match:
        return match.group(0)
    
    # Pattern alternativo: offerta NNNN_V
    match = re.search(r'\b(\d{4})_V\d+', testo_completo)
    if match:
        return match.group(0)
    
    return None

def extract_rate(root):
    """Estrae rate di pagamento multiple"""
    body = root.find('.//FatturaElettronicaBody')
    if body is None:
        return [{
            "numero": 1,
            "importo": "0.00",
            "scadenza": ""
        }]
    
    rate_elements = body.findall('.//DatiPagamento/DettaglioPagamento')
    
    if not rate_elements:
        # Nessuna rata specificata - usa importo totale e data documento
        totale = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/ImportoTotaleDocumento', "0")
        data = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/Data', "")
        return [{
            "numero": 1,
            "importo": f"{float(totale):.2f}",
            "scadenza": data
        }]
    
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

def extract_iban(root):
    """Estrae IBAN dal primo dettaglio pagamento"""
    body = root.find('.//FatturaElettronicaBody')
    if body is None:
        return ""
    iban = extract_text(body, './/DatiPagamento/DettaglioPagamento/IBAN')
    return iban if iban else ""

def extract_fattura(xml_file):
    """Estrae tutti i dati necessari da una fattura XML"""
    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()
        
        body = root.find('.//FatturaElettronicaBody')
        if body is None:
            raise ValueError("Struttura FatturaElettronicaBody non trovata")
        
        # Estrai campi principali
        numero = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/Numero')
        data_emissione = extract_text(body, './/DatiGenerali/DatiGeneraliDocumento/Data')
        
        cliente = extract_cliente(root)
        importi = extract_importi(root)
        descrizione = extract_descrizione(root)
        riferimento_offerta = extract_riferimento_offerta(root)
        rate = extract_rate(root)
        iban = extract_iban(root)
        
        return {
            "file": Path(xml_file).name,
            "numero": numero,
            "data_emissione": data_emissione,
            "cliente": cliente,
            "importi": importi,
            "descrizione": descrizione,
            "riferimento_offerta": riferimento_offerta,
            "rate": rate,
            "iban": iban,
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
        print("Uso: python extract_fatture_attive.py <file1.xml> [file2.xml] [...]", file=sys.stderr)
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
    print(f"\n✅ Elaborate {len(risultati)} fatture con successo", file=sys.stderr)
    if errori:
        print(f"❌ {len(errori)} errori durante l'elaborazione", file=sys.stderr)
    
    # Exit code: 0 se almeno una fattura OK, 1 se tutte fallite
    sys.exit(0 if risultati else 1)

if __name__ == "__main__":
    main()
