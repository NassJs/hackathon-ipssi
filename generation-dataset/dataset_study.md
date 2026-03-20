# Étude de Dataset — Documents Administratifs Français (Alignée Code)

Ce document est aligné avec `generation-dataset/pipeline_ocr.py` (version actuelle).

---

## 1) Objectif

Constituer un dataset synthétique et réaliste pour entraîner un pipeline de **classification documentaire** et de **détection d’anomalies cross-documents**.

Le pipeline est centré sur le **triptyque** :
- **Devis** (vérité de référence)
- **Bon de commande (BDC)**
- **Facture**

---

## 2) Sources de données

### 2.1 API Recherche d’Entreprises (par défaut)
- Utilisée pour récupérer **SIRET** + **dénomination**.
- API : `recherche-entreprises.api.gouv.fr`
- Déclenchée par défaut (désactivable avec `--no-recherche-api`).

### 2.2 Faker
- Complète les champs non fournis par l’API : adresses, IBAN, BIC, etc.
- Génère les dates et numéros de documents.

---

## 3) Génération des documents

### 3.1 Logique métier
- **Devis = vérité**
- La **facture** est alignée sur le devis par défaut
- Le **BDC** est daté après le devis

### 3.2 Templates
- Trois templates visuels : `classic`, `modern`, `compact`
- Rendu **Pillow** (pas de HTML/WeasyPrint)

---

## 4) Anomalies (altérations)

### 4.1 Types injectés
- `alteration_siret`
- `alteration_iban`
- `alteration_montant_ttc`
- `discordance_dates`
- `erreur_tva`

### 4.2 Niveaux
- L1 / L2 / L3 (40% / 35% / 25%)

### 4.3 Cibles
- **Devis jamais altéré** (référence)
- Altérations appliquées **sur BDC ou facture**

---

## 5) OCR

### 5.1 Prétraitement
- **Binarisation simple** via Pillow
- Pas d’OpenCV

### 5.2 OCR
- Moteur : **Tesseract**
- Langue : `fra`
- Mode : `--oem 1 --psm 6`
- Sortie utilisée : **texte brut uniquement**

---

## 6) Versions d’images

Versions disponibles :
- `v0` : propre
- `v1` : dégradation légère
- `v2` : dégradation plus forte

> `v3` est supprimée (trop bruitée / peu utile).

---

## 7) Fichiers de sortie

### 7.1 Fichiers globaux
- **`ocr_texts.csv`** : texte OCR prêt TF‑IDF / Random Forest
- **`annotations.csv`** : anomalies + labels

### 7.2 Par dossier
- `ground_truth.json`
- `facture_v0.png`, `devis_v0.png`, `bdc_v0.png`
- versions `_thresh.png` (prétraitées OCR)

> Le dossier `ocr_outputs/` est supprimé par défaut (pour ne garder que le CSV global).

---

## 8) Format des sorties

### 8.1 `ocr_texts.csv`
Colonnes :
- `dossier_id`
- `doc_type` (`devis`, `facture`, `bdc`)
- `version` (`v0`, `v1`, `v2`)
- `text`

### 8.2 `annotations.csv`
Colonnes :
- `dossier_id`
- `label` (`OK` / `ANOMALIE`)
- `anomalie_type`
- `anomalie_niveau`
- `document_affecte`
- `champ_affecte`
- `valeur_correcte`
- `valeur_alteree`
- `nb_documents`

---

## 9) Commande recommandée

Générer 1000 dossiers (v0 uniquement) :

```powershell
python generation-dataset/pipeline_ocr.py --out dataset --n 1000 --lang fra --versions 0 --no-raw
```

---

## 10) Notes importantes

- **API recherche entreprises** activée par défaut
- **Devis = vérité** pour la cohérence cross-docs
- Dataset final conçu pour l’équipe TF‑IDF / Random Forest

