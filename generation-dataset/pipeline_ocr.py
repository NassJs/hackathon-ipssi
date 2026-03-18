import argparse
import csv
import json
import os
import random
import subprocess
import shutil
import urllib.error
import urllib.request
import urllib.parse
import time
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

try:
    from faker import Faker
except Exception as exc:  # pragma: no cover
    raise SystemExit("Faker n'est pas installé. Faites: pip install faker") from exc


def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def _safe_unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        return


@dataclass
class FactureData:
    type: str
    numero: str
    date_emission: str
    date_echeance: str
    montant_ht: float
    tva: float
    montant_ttc: float


@dataclass
class DevisData:
    type: str
    numero: str
    date_emission: str
    date_validite: str
    montant_ht: float
    tva: float
    montant_ttc: float


@dataclass
class BonCommandeData:
    type: str
    numero: str
    date_signature: str


@dataclass
class DossierData:
    dossier_id: str
    label: str
    fournisseur: dict
    client: dict
    document: FactureData
    devis: DevisData
    bon_commande: BonCommandeData
    template_id: str
    anomalie_type: str | None = None
    anomalie_niveau: int | None = None
    document_affecte: str | None = None
    champ_affecte: str | None = None
    valeur_correcte: str | None = None
    valeur_alteree: str | None = None
    altered_fournisseur_siret_facture: str | None = None
    altered_fournisseur_siret_bdc: str | None = None
    altered_fournisseur_iban_facture: str | None = None
    altered_fournisseur_iban_bdc: str | None = None
    facture_siret_affiche: str | None = None
    facture_iban_affiche: str | None = None
    bdc_siret_affiche: str | None = None
    bdc_iban_affiche: str | None = None


def _random_siret() -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(14))


def _random_iban_fr() -> str:
    # IBAN FR: FR + 2 digits + 23 alphanum (ici uniquement chiffres)
    return "FR" + "".join(str(random.randint(0, 9)) for _ in range(25))


def _make_facture_data(today: datetime, montant_ht: float, tva: float, montant_ttc: float) -> FactureData:
    numero = f"FACT-{today.year}-{random.randint(1, 9999):04d}"
    date_emission = today.strftime("%d/%m/%Y")
    date_echeance = (today + timedelta(days=30)).strftime("%d/%m/%Y")
    return FactureData(
        type="facture",
        numero=numero,
        date_emission=date_emission,
        date_echeance=date_echeance,
        montant_ht=montant_ht,
        tva=tva,
        montant_ttc=montant_ttc,
    )


def _make_devis_data(today: datetime) -> DevisData:
    numero = f"DEV-{today.year}-{random.randint(1, 9999):04d}"
    date_emission = today.strftime("%d/%m/%Y")
    date_validite = (today + timedelta(days=30)).strftime("%d/%m/%Y")
    montant_ht = round(random.uniform(200, 6000), 2)
    tva = round(montant_ht * 0.2, 2)
    montant_ttc = round(montant_ht + tva, 2)
    return DevisData(
        type="devis",
        numero=numero,
        date_emission=date_emission,
        date_validite=date_validite,
        montant_ht=montant_ht,
        tva=tva,
        montant_ttc=montant_ttc,
    )


def _make_bon_commande_data(today: datetime) -> BonCommandeData:
    numero = f"BDC-{today.year}-{random.randint(1, 9999):04d}"
    date_signature = (today + timedelta(days=5)).strftime("%d/%m/%Y")
    return BonCommandeData(
        type="bon_commande",
        numero=numero,
        date_signature=date_signature,
    )


def _pick_template_id() -> str:
    return random.choice(["classic", "modern", "compact"])



def _http_get_json(url: str, user_agent: str | None = None) -> dict | None:
    headers = {"Accept": "application/json"}
    if user_agent:
        headers["User-Agent"] = user_agent
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None


def fetch_recherche_entreprises_random(
    base_url: str,
    query: str,
    n: int,
    per_page: int = 25,
    user_agent: str = "dataset-ocr/1.0",
) -> list[dict]:
    # 1) récupérer le total_pages via la page 1
    per_page = max(1, min(25, per_page))
    params = {"q": query, "page": 1, "per_page": per_page}
    url = f"{base_url.rstrip('/')}/search?{urllib.parse.urlencode(params)}"
    data = _http_get_json(url, user_agent=user_agent)
    if not isinstance(data, dict):
        return []
    total_pages = data.get("total_pages")
    if not isinstance(total_pages, int) or total_pages <= 0:
        return []

    results = []
    seen = set()

    # 2) échantillonnage de pages aléatoires
    pages_needed = max(1, (n + per_page - 1) // per_page)
    pages = set(random.randint(1, total_pages) for _ in range(pages_needed))

    for page in pages:
        params = {"q": query, "page": page, "per_page": per_page}
        url = f"{base_url.rstrip('/')}/search?{urllib.parse.urlencode(params)}"
        page_data = _http_get_json(url, user_agent=user_agent)
        if not isinstance(page_data, dict):
            continue
        for item in page_data.get("results", []):
            if not isinstance(item, dict):
                continue
            siege = item.get("siege", {}) if isinstance(item.get("siege"), dict) else {}
            siret = item.get("siret") or siege.get("siret")
            name = (
                item.get("nom_raison_sociale")
                or item.get("nom_complet")
                or item.get("denomination")
            )
            if not isinstance(siret, str) or not siret.strip():
                continue
            if siret in seen:
                continue
            seen.add(siret)
            results.append(
                {
                    "raison_sociale": name or "",
                    "siret": siret.strip(),
                }
            )
            if len(results) >= n:
                break
        if len(results) >= n:
            break
        # Respect du rate limit (7 req/s max)
        time.sleep(0.2)

    return results




def generate_dossier(
    dossier_id: str,
    faker: Faker,
    fournisseur_override: dict | None = None,
    client_override: dict | None = None,
) -> DossierData:
    today = datetime.now()

    fournisseur = None
    client = None
    if fournisseur_override:
        fournisseur = dict(fournisseur_override)
    if client_override:
        client = dict(client_override)

    if not fournisseur:
        fournisseur = {
            "raison_sociale": faker.company(),
            "siret": _random_siret(),
            "adresse": faker.address().replace("\n", ", "),
        }
    if not fournisseur.get("adresse"):
        fournisseur["adresse"] = faker.address().replace("\n", ", ")
    fournisseur["iban"] = _random_iban_fr()
    fournisseur["bic"] = "".join(str(random.randint(0, 9)) for _ in range(8))

    if not client:
        client = {
            "raison_sociale": faker.company(),
            "siret": _random_siret(),
            "adresse": faker.address().replace("\n", ", "),
        }
    if not client.get("adresse"):
        client["adresse"] = faker.address().replace("\n", ", ")

    devis = _make_devis_data(today)
    # Facture par défaut alignée sur le devis (devis = vérité)
    document = _make_facture_data(today, devis.montant_ht, devis.tva, devis.montant_ttc)
    bon_commande = _make_bon_commande_data(today)
    return DossierData(
        dossier_id=dossier_id,
        label="OK",
        fournisseur=fournisseur,
        client=client,
        document=document,
        devis=devis,
        bon_commande=bon_commande,
        template_id=_pick_template_id(),
    )


def _mutate_one_digit(value: str) -> str:
    if not value:
        return value
    idx = random.randint(0, len(value) - 1)
    original = value[idx]
    if not original.isdigit():
        # si ce n'est pas un chiffre, on cherche un autre index
        for _ in range(10):
            idx = random.randint(0, len(value) - 1)
            if value[idx].isdigit():
                original = value[idx]
                break
        else:
            return value
    new_digit = str((int(original) + random.randint(1, 9)) % 10)
    return value[:idx] + new_digit + value[idx + 1 :]


def apply_anomaly(dossier: DossierData, level: int, anomaly_type: str) -> DossierData:
    # Copie superficielle
    d = replace(dossier)
    d.label = "ANOMALIE"
    d.anomalie_type = anomaly_type
    d.anomalie_niveau = level

    if anomaly_type == "alteration_siret":
        target_doc = random.choice(["facture", "bon_commande"])
        d.document_affecte = target_doc
        d.champ_affecte = "siret_fournisseur"
        correct = d.fournisseur["siret"]
        if level == 1:
            altered = _random_siret()
        elif level == 2:
            altered = _mutate_one_digit(_mutate_one_digit(correct))
        else:
            altered = _mutate_one_digit(correct)
        d.valeur_correcte = correct
        d.valeur_alteree = altered
        if target_doc == "facture":
            d.altered_fournisseur_siret_facture = altered
            d.facture_siret_affiche = altered
        else:
            d.altered_fournisseur_siret_bdc = altered
            d.bdc_siret_affiche = altered

    elif anomaly_type == "alteration_iban":
        target_doc = random.choice(["facture", "bon_commande"])
        d.document_affecte = target_doc
        d.champ_affecte = "iban"
        correct = d.fournisseur["iban"]
        if level == 1:
            altered = _random_iban_fr()
        elif level == 2:
            altered = _mutate_one_digit(_mutate_one_digit(correct))
        else:
            altered = _mutate_one_digit(correct)
        d.valeur_correcte = correct
        d.valeur_alteree = altered
        if target_doc == "facture":
            d.altered_fournisseur_iban_facture = altered
            d.facture_iban_affiche = altered
        else:
            d.altered_fournisseur_iban_bdc = altered
            d.bdc_iban_affiche = altered

    elif anomaly_type == "alteration_montant_ttc":
        d.document_affecte = "facture"
        d.champ_affecte = "montant_ttc"
        correct = d.document.montant_ttc
        if level == 1:
            altered = round(correct * 1.2, 2)
        elif level == 2:
            altered = round(correct * 1.02, 2)
        else:
            altered = round(correct + 0.01, 2)
        d.valeur_correcte = f"{correct:.2f}"
        d.valeur_alteree = f"{altered:.2f}"
        d.document.montant_ttc = altered

    elif anomaly_type == "discordance_dates":
        target_doc = random.choice(["facture", "bon_commande"])
        d.document_affecte = target_doc
        if target_doc == "facture":
            d.champ_affecte = "date_emission"
            correct = d.document.date_emission
            # rendre facture avant devis (incohérent)
            try:
                dt = datetime.strptime(correct, "%d/%m/%Y")
                altered_dt = dt - timedelta(days=10)
                altered = altered_dt.strftime("%d/%m/%Y")
            except Exception:
                altered = correct
            d.valeur_correcte = correct
            d.valeur_alteree = altered
            d.document.date_emission = altered
        else:
            d.champ_affecte = "date_signature"
            correct = d.bon_commande.date_signature
            try:
                dt = datetime.strptime(correct, "%d/%m/%Y")
                altered_dt = dt - timedelta(days=15)
                altered = altered_dt.strftime("%d/%m/%Y")
            except Exception:
                altered = correct
            d.valeur_correcte = correct
            d.valeur_alteree = altered
            d.bon_commande.date_signature = altered

    elif anomaly_type == "erreur_tva":
        d.document_affecte = "facture"
        d.champ_affecte = "tva_calcul"
        correct = d.document.tva
        if level == 1:
            altered = round(correct * 0.5, 2)
        elif level == 2:
            altered = round(correct * 0.9, 2)
        else:
            altered = round(correct - 0.01, 2)
        d.valeur_correcte = f"{correct:.2f}"
        d.valeur_alteree = f"{altered:.2f}"
        d.document.tva = altered

    return d


def _load_font(size: int) -> ImageFont.ImageFont:
    # Essaie une police système courante Windows, sinon fallback Pillow
    try:
        return ImageFont.truetype("arial.ttf", size=size)
    except Exception:
        return ImageFont.load_default()


def _text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    # Compat Pillow: textlength if available, else bbox
    if hasattr(draw, "textlength"):
        return int(draw.textlength(text, font=font))
    bbox = draw.textbbox((0, 0), text, font=font)
    return int(bbox[2] - bbox[0])


def _draw_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: int,
    y: int,
    max_width: int,
    font: ImageFont.ImageFont,
    line_gap: int,
) -> int:
    # Retourne le nouveau y après avoir dessiné le texte
    words = text.split()
    if not words:
        return y
    line = words[0]
    lines = []
    for w in words[1:]:
        test_line = f"{line} {w}"
        if _text_width(draw, test_line, font) <= max_width:
            line = test_line
        else:
            lines.append(line)
            line = w
    lines.append(line)
    for ln in lines:
        draw.text((x, y), ln, fill="black", font=font)
        y += line_gap
    return y


def render_document_image(
    dossier: DossierData,
    out_path: Path,
    dpi: int,
    doc_title: str,
    doc_number: str,
    date1_label: str,
    date1_value: str,
    date2_label: str | None = None,
    date2_value: str | None = None,
    show_amounts: bool = True,
    fournisseur_override: dict | None = None,
    montant_ht: float | None = None,
    montant_tva: float | None = None,
    montant_ttc: float | None = None,
) -> None:
    # Canvas A4 approx @300dpi
    # scale en fonction du dpi (2480x3508 @300)
    scale = dpi / 300.0
    width, height = int(2480 * scale), int(3508 * scale)
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    # Polices lisibles pour A4 300dpi
    title_font = _load_font(78)
    section_font = _load_font(42)
    body_font = _load_font(34)
    small_font = _load_font(28)

    margin = int(100 * scale)

    # Styles par template
    template_id = dossier.template_id

    fournisseur = dict(dossier.fournisseur)
    if fournisseur_override:
        fournisseur.update({k: v for k, v in fournisseur_override.items() if v})

    if template_id == "modern":
        # Bandeau haut
        band_h = int(180 * scale)
        draw.rectangle([0, 0, width, band_h], fill="#F3F3F3")
        draw.text((margin, int(60 * scale)), doc_title.upper(), fill="black", font=title_font)
        draw.rectangle([width - margin - int(220 * scale), int(40 * scale), width - margin, int(140 * scale)], outline="black", width=2)
        draw.text((width - margin - int(185 * scale), int(70 * scale)), "LOGO", fill="black", font=body_font)

        # Bloc facture à gauche
        left_x = margin
        y = band_h + int(30 * scale)
        draw.text((left_x, y), f"N°: {doc_number}", fill="black", font=body_font)
        y += int(40 * scale)
        draw.text((left_x, y), f"{date1_label}: {date1_value}", fill="black", font=body_font)
        if date2_label and date2_value:
            y += int(40 * scale)
            draw.text((left_x, y), f"{date2_label}: {date2_value}", fill="black", font=body_font)

        # Fournisseur à droite
        right_x = int(1500 * scale)
        y = band_h + int(30 * scale)
        max_right_width = width - right_x - margin
        y = _draw_wrapped(draw, fournisseur["raison_sociale"], right_x, y, max_right_width, section_font, int(45 * scale))
        y = _draw_wrapped(draw, fournisseur["adresse"], right_x, y, max_right_width, body_font, int(35 * scale))
        draw.text((right_x, y), f"SIRET: {fournisseur['siret']}", fill="black", font=body_font)
        y += int(35 * scale)
        draw.text((right_x, y), f"IBAN: {fournisseur['iban']}", fill="black", font=body_font)

        # Client box à gauche
        client_box_top = band_h + int(170 * scale)
        client_box_left = margin
        client_box_right = int(1150 * scale)
        client_box_bottom = client_box_top + int(220 * scale)
    elif template_id == "compact":
        # Logo à droite, titre centré
        draw.text((int(width * 0.5 - 180 * scale), int(80 * scale)), doc_title.upper(), fill="black", font=title_font)
        draw.rectangle([width - margin - int(240 * scale), int(70 * scale), width - margin, int(190 * scale)], outline="black", width=2)
        draw.text((width - margin - int(200 * scale), int(105 * scale)), "LOGO", fill="black", font=body_font)

        # Fournisseur en haut gauche
        left_x = margin
        y = int(220 * scale)
        max_left_width = int(900 * scale)
        y = _draw_wrapped(draw, fournisseur["raison_sociale"], left_x, y, max_left_width, section_font, int(45 * scale))
        y = _draw_wrapped(draw, fournisseur["adresse"], left_x, y, max_left_width, body_font, int(35 * scale))
        draw.text((left_x, y), f"SIRET: {fournisseur['siret']}", fill="black", font=body_font)
        y += int(35 * scale)
        draw.text((left_x, y), f"IBAN: {fournisseur['iban']}", fill="black", font=body_font)

        # Bloc facture (droite)
        right_x = int(1350 * scale)
        y = int(230 * scale)
        draw.text((right_x, y), f"N°: {doc_number}", fill="black", font=body_font)
        y += int(40 * scale)
        draw.text((right_x, y), f"{date1_label}: {date1_value}", fill="black", font=body_font)
        if date2_label and date2_value:
            y += int(40 * scale)
            draw.text((right_x, y), f"{date2_label}: {date2_value}", fill="black", font=body_font)

        # Client box pleine largeur mais plus basse
        client_box_top = int(520 * scale)
        client_box_left = margin
        client_box_right = width - margin
        client_box_bottom = int(760 * scale)
    else:
        # classic (par défaut)
        draw.rectangle([margin, int(70 * scale), margin + int(240 * scale), int(190 * scale)], outline="black", width=2)
        draw.text((margin + int(25 * scale), int(105 * scale)), "LOGO", fill="black", font=body_font)

        # Bloc fournisseur (gauche)
        left_x = margin
        y = int(220 * scale)
        max_left_width = int(1100 * scale)
        y = _draw_wrapped(
            draw,
            fournisseur["raison_sociale"],
            left_x,
            y,
            max_left_width,
            section_font,
            int(45 * scale),
        )
        y = _draw_wrapped(
            draw,
            fournisseur["adresse"],
            left_x,
            y,
            max_left_width,
            body_font,
            int(35 * scale),
        )
        draw.text((left_x, y), f"SIRET: {fournisseur['siret']}", fill="black", font=body_font)
        y += int(35 * scale)
        draw.text((left_x, y), f"IBAN: {fournisseur['iban']}", fill="black", font=body_font)

        # Bloc facture (droite)
        right_x = int(1500 * scale)
        y = int(220 * scale)
        draw.text((right_x, y), doc_title.upper(), fill="black", font=title_font)
        y += int(90 * scale)
        draw.text((right_x, y), f"N°: {doc_number}", fill="black", font=body_font)
        y += int(40 * scale)
        draw.text((right_x, y), f"{date1_label}: {date1_value}", fill="black", font=body_font)
        if date2_label and date2_value:
            y += int(40 * scale)
            draw.text((right_x, y), f"{date2_label}: {date2_value}", fill="black", font=body_font)

        # Bloc client (encadré)
        client_box_top = int(520 * scale)
        client_box_left = margin
        client_box_right = width - margin
        client_box_bottom = int(760 * scale)

    # Bloc client (commun)
    draw.rectangle([client_box_left, client_box_top, client_box_right, client_box_bottom], outline="black", width=2)
    draw.text((client_box_left + int(20 * scale), client_box_top + int(15 * scale)), "Facturer à :", fill="black", font=section_font)
    cx = client_box_left + int(20 * scale)
    cy = client_box_top + int(70 * scale)
    max_client_width = client_box_right - cx - int(20 * scale)
    cy = _draw_wrapped(
        draw,
        dossier.client["raison_sociale"],
        cx,
        cy,
        max_client_width,
        body_font,
        int(35 * scale),
    )
    cy = _draw_wrapped(
        draw,
        dossier.client["adresse"],
        cx,
        cy,
        max_client_width,
        body_font,
        int(35 * scale),
    )
    draw.text((cx, cy), f"SIRET: {dossier.client['siret']}", fill="black", font=body_font)

    # Tableau lignes (optionnel)
    table_top = int(820 * scale)
    table_left = margin
    table_right = width - margin
    row_height = int(55 * scale)

    if show_amounts:
        m_ht = dossier.document.montant_ht if montant_ht is None else montant_ht
        m_tva = dossier.document.tva if montant_tva is None else montant_tva
        m_ttc = dossier.document.montant_ttc if montant_ttc is None else montant_ttc
        # En-tête tableau
        draw.rectangle([table_left, table_top, table_right, table_top + row_height], fill="#F2F2F2", outline="black")
        draw.text((table_left + int(20 * scale), table_top + int(12 * scale)), "Désignation", fill="black", font=body_font)
        draw.text((table_right - int(700 * scale), table_top + int(12 * scale)), "Qté", fill="black", font=body_font)
        draw.text((table_right - int(550 * scale), table_top + int(12 * scale)), "PU HT", fill="black", font=body_font)
        draw.text((table_right - int(320 * scale), table_top + int(12 * scale)), "Total HT", fill="black", font=body_font)

        # Lignes produits (simples, cohérentes)
        items = [
            ("Prestation de service A", 1, m_ht * 0.6),
            ("Prestation de service B", 1, m_ht * 0.4),
        ]
        y = table_top + row_height
        for name, qty, total in items:
            draw.rectangle([table_left, y, table_right, y + row_height], outline="black")
            draw.text((table_left + int(20 * scale), y + int(12 * scale)), name, fill="black", font=body_font)
            draw.text((table_right - int(690 * scale), y + int(12 * scale)), str(qty), fill="black", font=body_font)
            pu = total / qty
            draw.text((table_right - int(560 * scale), y + int(12 * scale)), f"{pu:.2f} EUR", fill="black", font=body_font)
            draw.text((table_right - int(340 * scale), y + int(12 * scale)), f"{total:.2f} EUR", fill="black", font=body_font)
            y += row_height

        # Totaux (encadré à droite)
        totals_top = y + int(40 * scale)
        totals_left = table_right - int(650 * scale)
        totals_right = table_right
        totals_bottom = totals_top + int(200 * scale)
        draw.rectangle([totals_left, totals_top, totals_right, totals_bottom], outline="black", width=2)
        draw.text((totals_left + int(20 * scale), totals_top + int(20 * scale)), "Total HT", fill="black", font=body_font)
        draw.text((totals_right - int(240 * scale), totals_top + int(20 * scale)), f"{m_ht:.2f} EUR", fill="black", font=body_font)
        draw.text((totals_left + int(20 * scale), totals_top + int(70 * scale)), "TVA 20%", fill="black", font=body_font)
        draw.text((totals_right - int(240 * scale), totals_top + int(70 * scale)), f"{m_tva:.2f} EUR", fill="black", font=body_font)
        draw.text((totals_left + int(20 * scale), totals_top + int(120 * scale)), "Total TTC", fill="black", font=section_font)
        draw.text((totals_right - int(260 * scale), totals_top + int(120 * scale)), f"{m_ttc:.2f} EUR", fill="black", font=section_font)

    # Pied de page
    footer_y = height - int(180 * scale)
    draw.line([margin, footer_y, width - margin, footer_y], fill="black", width=2)
    draw.text(
        (margin, footer_y + 20),
        f"Paiement à 30 jours. IBAN: {fournisseur['iban']}",
        fill="black",
        font=small_font,
    )
    draw.text((margin, footer_y + 55), "Merci de votre confiance.", fill="black", font=small_font)

    # Sauvegarde
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, dpi=(dpi, dpi))


def render_facture_image(dossier: DossierData, out_path: Path, dpi: int = 300) -> None:
    fournisseur_override = {}
    if dossier.altered_fournisseur_siret_facture:
        fournisseur_override["siret"] = dossier.altered_fournisseur_siret_facture
    if dossier.facture_siret_affiche is None and dossier.altered_fournisseur_siret_facture:
        dossier.facture_siret_affiche = dossier.altered_fournisseur_siret_facture
    if dossier.altered_fournisseur_iban_facture:
        fournisseur_override["iban"] = dossier.altered_fournisseur_iban_facture
    if dossier.facture_iban_affiche is None and dossier.altered_fournisseur_iban_facture:
        dossier.facture_iban_affiche = dossier.altered_fournisseur_iban_facture
    render_document_image(
        dossier,
        out_path,
        dpi,
        doc_title="Facture",
        doc_number=dossier.document.numero,
        date1_label="Date émission",
        date1_value=dossier.document.date_emission,
        date2_label="Date échéance",
        date2_value=dossier.document.date_echeance,
        show_amounts=True,
        fournisseur_override=fournisseur_override if fournisseur_override else None,
        montant_ht=dossier.document.montant_ht,
        montant_tva=dossier.document.tva,
        montant_ttc=dossier.document.montant_ttc,
    )


def render_devis_image(dossier: DossierData, out_path: Path, dpi: int = 300) -> None:
    render_document_image(
        dossier,
        out_path,
        dpi,
        doc_title="Devis",
        doc_number=dossier.devis.numero,
        date1_label="Date émission",
        date1_value=dossier.devis.date_emission,
        date2_label="Date validité",
        date2_value=dossier.devis.date_validite,
        show_amounts=True,
        montant_ht=dossier.devis.montant_ht,
        montant_tva=dossier.devis.tva,
        montant_ttc=dossier.devis.montant_ttc,
    )


def render_bon_commande_image(dossier: DossierData, out_path: Path, dpi: int = 300) -> None:
    fournisseur_override = {}
    if dossier.altered_fournisseur_siret_bdc:
        fournisseur_override["siret"] = dossier.altered_fournisseur_siret_bdc
    if dossier.bdc_siret_affiche is None and dossier.altered_fournisseur_siret_bdc:
        dossier.bdc_siret_affiche = dossier.altered_fournisseur_siret_bdc
    if dossier.altered_fournisseur_iban_bdc:
        fournisseur_override["iban"] = dossier.altered_fournisseur_iban_bdc
    if dossier.bdc_iban_affiche is None and dossier.altered_fournisseur_iban_bdc:
        dossier.bdc_iban_affiche = dossier.altered_fournisseur_iban_bdc
    render_document_image(
        dossier,
        out_path,
        dpi,
        doc_title="Bon de commande",
        doc_number=dossier.bon_commande.numero,
        date1_label="Date signature",
        date1_value=dossier.bon_commande.date_signature,
        date2_label=None,
        date2_value=None,
        show_amounts=False,
        fournisseur_override=fournisseur_override if fournisseur_override else None,
    )


def apply_degradations(img: Image.Image, level: int) -> Image.Image:
    # v1: léger flou + bruit léger
    # v2: plus de flou + contraste réduit + bruit
    if level == 1:
        img = img.filter(ImageFilter.GaussianBlur(radius=1.5))
        img = ImageOps.autocontrast(img, cutoff=4)
        img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=50, threshold=3))
    elif level == 2:
        img = img.filter(ImageFilter.GaussianBlur(radius=2.8))
        img = ImageOps.autocontrast(img, cutoff=8)
        img = ImageOps.colorize(ImageOps.grayscale(img), black="#111111", white="#F0F0F0")
        # légère rotation (scan mal aligné)
        angle = random.uniform(-1.5, 1.5)
        img = img.rotate(angle, expand=False, fillcolor="white")
    return img


def preprocess_for_ocr(img_path: Path, out_path: Path) -> Path:
    img = Image.open(img_path).convert("L")
    img = img.point(lambda x: 0 if x < 180 else 255, mode="1")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    return out_path


def _run_tesseract(
    image_path: Path,
    out_base: Path,
    lang: str = "fra",
    formats: list[str] | None = None,
) -> None:
    formats = formats or ["txt", "tsv", "hocr"]
    formats = [f.lower() for f in formats]

    # 1) TXT (sortie par défaut)
    cmd_txt = [
        "tesseract",
        str(image_path),
        str(out_base),
        "-l",
        lang,
        "--oem",
        "1",
        "--psm",
        "6",
    ]
    # 2) TSV + hOCR (formats additionnels)
    cmd_formats = [
        "tesseract",
        str(image_path),
        str(out_base),
        "-l",
        lang,
        "--oem",
        "1",
        "--psm",
        "6",
        "tsv",
        "hocr",
    ]
    try:
        if "txt" in formats:
            subprocess.run(cmd_txt, check=True, capture_output=True)
        if "tsv" in formats or "hocr" in formats:
            subprocess.run(cmd_formats, check=True, capture_output=True)
    except FileNotFoundError as exc:
        raise SystemExit(
            "Tesseract n'est pas installé ou pas dans le PATH. "
            "Installez Tesseract + pack langue 'fra'."
        ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.decode("utf-8", errors="ignore")
        raise SystemExit(f"Erreur Tesseract: {stderr}") from exc


def _mean_conf_from_tsv(tsv_path: Path) -> float:
    if not tsv_path.exists():
        return 0.0
    total = 0.0
    count = 0
    with tsv_path.open("r", encoding="utf-8", errors="ignore") as f:
        for i, line in enumerate(f):
            if i == 0:
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 11:
                continue
            conf = parts[10]
            try:
                conf_val = float(conf)
            except ValueError:
                continue
            if conf_val < 0:
                continue
            total += conf_val
            count += 1
    return round(total / count, 2) if count else 0.0


def run_ocr(
    image_path: Path,
    out_dir: Path,
    lang: str = "fra",
    formats: list[str] | None = None,
) -> dict:
    _ensure_dir(out_dir)
    out_base = out_dir / image_path.stem
    _run_tesseract(image_path, out_base, lang=lang, formats=formats)

    txt_path = out_base.with_suffix(".txt")
    tsv_path = out_base.with_suffix(".tsv")
    hocr_path = out_base.with_suffix(".hocr")

    text = ""
    if txt_path.exists():
        text = txt_path.read_text(encoding="utf-8", errors="ignore")

    mean_conf = _mean_conf_from_tsv(tsv_path) if (formats is None or "tsv" in formats) else 0.0

    return {
        "text": text,
        "txt_path": str(txt_path),
        "tsv_path": str(tsv_path),
        "hocr_path": str(hocr_path),
        "ocr_conf_moy": mean_conf,
    }


def generate_dataset_and_ocr(
    out_root: Path,
    num_dossiers: int,
    lang: str = "fra",
    versions: list[int] | None = None,
    dpi: int = 300,
    keep_raw: bool = True,
    recherche_api: bool = False,
    recherche_base: str | None = None,
    recherche_query: str | None = None,
    recherche_random: int | None = None,
    ocr_formats: list[str] | None = None,
) -> list:
    faker = Faker("fr_FR")
    results = []
    annotations_rows = []

    anomaly_types = [
        "alteration_siret",
        "alteration_iban",
        "alteration_montant_ttc",
        "discordance_dates",
        "erreur_tva",
    ]
    anomaly_levels = [1, 2, 3]
    anomaly_level_weights = [0.40, 0.35, 0.25]
    anomaly_rate = 0.35

    _ensure_dir(out_root)

    # Si mode random API: on récupère une liste de SIRET avant la boucle
    random_pool = []
    if recherche_api and recherche_base and recherche_query and recherche_random:
        random_pool = fetch_recherche_entreprises_random(
            recherche_base,
            recherche_query,
            recherche_random,
        )

    for i in range(1, num_dossiers + 1):
        dossier_id = f"dossier_{i:05d}"
        dossier_dir = out_root / dossier_id
        _ensure_dir(dossier_dir)

        # SIRET par dossier (fournisseur/client) si pool disponible
        siret_pair = None
        fournisseur_override = None
        client_override = None
        if random_pool:
            # On prend 2 établissements différents si possible
            a = random.choice(random_pool)
            b = random.choice(random_pool)
            if isinstance(a, dict) and isinstance(b, dict):
                s1 = a.get("siret")
                s2 = b.get("siret")
                if isinstance(s1, str) and isinstance(s2, str):
                    siret_pair = [s1, s2]
                if recherche_api:
                    fournisseur_override = {
                        "raison_sociale": a.get("raison_sociale", ""),
                        "siret": s1,
                    }
                    client_override = {
                        "raison_sociale": b.get("raison_sociale", ""),
                        "siret": s2,
                    }

        dossier = generate_dossier(
            dossier_id,
            faker,
            fournisseur_override=fournisseur_override,
            client_override=client_override,
        )

        # Appliquer anomalie (35% des dossiers)
        if random.random() < anomaly_rate:
            level = random.choices(anomaly_levels, weights=anomaly_level_weights, k=1)[0]
            anomaly_type = random.choice(anomaly_types)
            dossier = apply_anomaly(dossier, level, anomaly_type)

        # Sauvegarde ground truth
        gt_path = dossier_dir / "ground_truth.json"
        with gt_path.open("w", encoding="utf-8") as f:
            json.dump(
                {
                    "dossier_id": dossier.dossier_id,
                    "label": dossier.label,
                    "anomalie_type": dossier.anomalie_type,
                    "anomalie_niveau": dossier.anomalie_niveau,
                    "document_affecte": dossier.document_affecte,
                    "champ_affecte": dossier.champ_affecte,
                    "valeur_correcte": dossier.valeur_correcte,
                    "valeur_alteree": dossier.valeur_alteree,
                    "fournisseur": dossier.fournisseur,
                    "client": dossier.client,
                    "documents": {
                        "devis": asdict(dossier.devis),
                        "bon_commande": asdict(dossier.bon_commande),
                        "facture": asdict(dossier.document),
                    },
                    "documents_affiches": {
                        "facture": {
                            "siret": dossier.facture_siret_affiche or dossier.fournisseur["siret"],
                            "iban": dossier.facture_iban_affiche or dossier.fournisseur["iban"],
                        },
                        "bon_commande": {
                            "siret": dossier.bdc_siret_affiche or dossier.fournisseur["siret"],
                            "iban": dossier.bdc_iban_affiche or dossier.fournisseur["iban"],
                        },
                    },
                    "template_id": dossier.template_id,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

        # Génération images v0 (facture / devis / bdc) uniquement si nécessaire
        use_versions = versions or [0, 1, 2]
        need_v0 = 0 in use_versions or any(v in (1, 2) for v in use_versions)
        facture_v0 = dossier_dir / "facture_v0.png"
        devis_v0 = dossier_dir / "devis_v0.png"
        bdc_v0 = dossier_dir / "bdc_v0.png"
        if need_v0:
            render_facture_image(dossier, facture_v0, dpi=dpi)
            render_devis_image(dossier, devis_v0, dpi=dpi)
            render_bon_commande_image(dossier, bdc_v0, dpi=dpi)

        # Variantes v1/v2 (v3 uniquement si demandée) uniquement si demandées
        use_versions = versions or [0, 1, 2]
        needed_levels = [v for v in use_versions if v in (1, 2, 3)]
        if needed_levels:
            for base_path in (facture_v0, devis_v0, bdc_v0):
                base_img = Image.open(base_path)
                for level in needed_levels:
                    img = apply_degradations(base_img.copy(), level)
                    v_path = dossier_dir / f"{base_path.stem.replace('_v0','')}_v{level}.png"
                    img.save(v_path)

        # OCR (après prétraitement simple)
        ocr_dir = dossier_dir / "ocr_outputs"
        _ensure_dir(ocr_dir)

        use_versions = versions or [0, 1, 2]
        image_list = []
        for v in use_versions:
            if v == 0:
                image_list.extend([facture_v0, devis_v0, bdc_v0])
            else:
                image_list.extend(
                    [
                        dossier_dir / f"facture_v{v}.png",
                        dossier_dir / f"devis_v{v}.png",
                        dossier_dir / f"bdc_v{v}.png",
                    ]
                )

        for img_path in image_list:
            pre_path = dossier_dir / f"{img_path.stem}_thresh.png"
            pre_img_path = preprocess_for_ocr(img_path, pre_path)
            ocr_res = run_ocr(pre_img_path, ocr_dir, lang=lang, formats=ocr_formats)
            entry = {
                "dossier_id": dossier_id,
                "image": str(img_path),
                "preprocessed": str(pre_img_path),
                **ocr_res,
            }
            results.append(entry)

        if not keep_raw:
            # Supprime les images brutes pour gagner de la place
            _safe_unlink(facture_v0)
            _safe_unlink(devis_v0)
            _safe_unlink(bdc_v0)
            for level in (1, 2, 3):
                _safe_unlink(dossier_dir / f"facture_v{level}.png")
                _safe_unlink(dossier_dir / f"devis_v{level}.png")
                _safe_unlink(dossier_dir / f"bdc_v{level}.png")
        # Supprime les sorties OCR pour ne garder que le CSV global
        if os.getenv("KEEP_OCR_OUTPUTS", "").strip() != "1":
            shutil.rmtree(ocr_dir, ignore_errors=True)

        annotations_rows.append(
            {
                "dossier_id": dossier.dossier_id,
                "label": dossier.label,
                "anomalie_type": dossier.anomalie_type or "",
                "anomalie_niveau": dossier.anomalie_niveau or "",
                "document_affecte": dossier.document_affecte or "",
                "champ_affecte": dossier.champ_affecte or "",
                "valeur_correcte": dossier.valeur_correcte or "",
                "valeur_alteree": dossier.valeur_alteree or "",
                "nb_documents": 3,
            }
        )

    # Écrit annotations.csv global
    annotations_path = out_root / "annotations.csv"
    with annotations_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "dossier_id",
                "label",
                "anomalie_type",
                "anomalie_niveau",
                "document_affecte",
                "champ_affecte",
                "valeur_correcte",
                "valeur_alteree",
                "nb_documents",
            ],
        )
        writer.writeheader()
        writer.writerows(annotations_rows)

    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="dataset", help="Dossier racine de sortie")
    parser.add_argument("--n", type=int, default=1, help="Nombre de dossiers à générer")
    parser.add_argument("--lang", default="fra", help="Langue Tesseract")
    parser.add_argument(
        "--dpi",
        type=int,
        default=300,
        help="DPI pour le rendu (ex: 250 pour accélérer)",
    )
    parser.add_argument(
        "--versions",
        default="0,1,2",
        help="Versions à traiter (ex: 1,2 pour accélérer)",
    )
    parser.add_argument(
        "--no-raw",
        action="store_true",
        help="Supprime les images brutes facture_v*.png après OCR",
    )
    parser.add_argument(
        "--recherche-api",
        action="store_true",
        default=True,
        help="Utilise l'API recherche-entreprises.api.gouv.fr pour récupérer SIRET + dénomination (activé par défaut)",
    )
    parser.add_argument(
        "--no-recherche-api",
        action="store_true",
        help="Désactive l'API recherche entreprises (retour à Faker uniquement)",
    )
    parser.add_argument(
        "--recherche-base",
        default="https://recherche-entreprises.api.gouv.fr",
        help="Base URL API recherche entreprises",
    )
    parser.add_argument(
        "--recherche-query",
        default="a",
        help="Terme de recherche (q) pour l'API recherche entreprises",
    )
    parser.add_argument(
        "--recherche-random",
        type=int,
        default=0,
        help="Nombre d'entreprises à échantillonner via l'API recherche entreprises (défaut: 2x n)",
    )
    args = parser.parse_args()

    out_root = Path(args.out)
    versions = [int(v.strip()) for v in args.versions.split(",") if v.strip() != ""]
    ocr_formats = ["txt"]
    recherche_api = args.recherche_api and not args.no_recherche_api
    recherche_random = args.recherche_random or (args.n * 2 if recherche_api else None)

    results = generate_dataset_and_ocr(
        out_root,
        args.n,
        lang=args.lang,
        versions=versions,
        dpi=args.dpi,
        keep_raw=not args.no_raw,
        recherche_api=recherche_api,
        recherche_base=args.recherche_base,
        recherche_query=args.recherche_query,
        recherche_random=recherche_random,
        ocr_formats=ocr_formats,
    )

    # CSV global pour TF-IDF / Random Forest
    texts_csv = out_root / "ocr_texts.csv"
    with texts_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["dossier_id", "doc_type", "version", "text"],
        )
        writer.writeheader()
        for r in results:
            image_path = Path(r.get("image", ""))
            stem = image_path.stem  # ex: facture_v1
            doc_type = ""
            version = ""
            if "_v" in stem:
                parts = stem.split("_v", 1)
                doc_type = parts[0]
                version = f"v{parts[1]}"
            else:
                doc_type = stem
            writer.writerow(
                {
                    "dossier_id": r.get("dossier_id", ""),
                    "doc_type": doc_type,
                    "version": version,
                    "text": " ".join(r.get("text", "").split()),
                }
            )

    # Résumé simple
    print(f"OK - {len(results)} OCR outputs générés")
    print(f"Annotations: annotations.csv écrit dans {out_root}")
    print(f"Textes: ocr_texts.csv écrit dans {out_root}")


if __name__ == "__main__":
    main()
