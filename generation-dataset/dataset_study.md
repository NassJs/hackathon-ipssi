# Étude de Dataset — Documents Administratifs Français


## 1. Objectif du Dataset

L'objectif est de constituer un dataset synthétique, mais hautement réaliste, pour entraîner et tester un pipeline de traitement automatique de documents administratifs. Ce pipeline repose sur **5 étapes séquentielles**.

### 1.1 Vue d'Ensemble du Pipeline IA

```
┌─────────────────────┐     ┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  ① Prétraitement    │ ──► │   ② OCR         │ ──► │  ③ Classification    │ ──► │  ④ Extraction    │ ──► │  ⑤ Score         │
│     Image           │     │   Tesseract v5  │     │     NLP              │     │     d'Infos      │     │     Confiance    │
│                     │     │   (TSV / hOCR)  │     │  TF-IDF → RF        │     │  Regex + NER     │     │  OCR + classif.  │
│  OpenCV / Pillow    │     │                 │     │                      │     │                  │     │                  │
└─────────────────────┘     └─────────────────┘     └──────────────────────┘     └──────────────────┘     └──────────────────┘
```

Chaque étape produit des sorties consommées par la suivante :

- **Prétraitement Image** → image normalisée (redressée, débruitée, binarisée).
- **OCR** → texte brut + coordonnées TSV/hOCR + score de confiance OCR.
- **Classification NLP** → type de document prédit + probabilité de classe.
- **Extraction d'Infos** → entités structurées : SIRET, IBAN, montants, dates.
- **Score Confiance** → score composite `= 0.5 × OCR_conf + 0.5 × classif_conf`, utilisé pour déclencher une revue manuelle si trop bas.

Le modèle final devra être capable de :

- Classifier les types de documents administratifs (7 classes).
- Extraire les informations pertinentes : SIRET, IBAN, montants HT/TVA/TTC, dates.
- Vérifier la conformité cross-document et détecter les anomalies / tentatives de fraude.
- Exposer un **Score Confiance composite** pour chaque résultat.
- Être robuste aux erreurs OCR issues de scans dégradés ou de photos smartphone.

---

## 2. Sources de Données

### 2.1 API SIRENE / Base INSEE

- Raisons Sociales et numéros SIRET/SIREN réels — garantit la vraisemblance des expressions textuelles.
- Codes NAF (secteur d'activité) et adresses postales françaises authentiques.

### 2.2 Librairie Python Faker

- Noms de contacts, numéros de téléphone, emails professionnels (`@entreprise.com`).
- Numéros de factures/devis au format standard (`FACT-2026-0042`, `DEV-2026-0010`).
- Dates d'émission et d'échéance cohérentes au format `JJ/MM/AAAA`.
- Articles/Prestations fictives avec tarifs unitaires et quantités.
- Coordonnées bancaires (IBAN `FR76...` / BIC).

---

## 3. Étapes du Pipeline — Détail Technique

### Étape 1 — Prétraitement Image (OpenCV + Pillow)

Cette étape conditionne directement la qualité de l'OCR. Elle prépare chaque image avant son envoi à Tesseract.

| Opération | Outil | Description | Impact sur l'OCR |
|-----------|-------|-------------|-----------------|
| Redressement (Deskew) | OpenCV | Correction de la rotation (−5° à +5°) | **Élevé** — améliore fortement la lecture des lignes |
| Binarisation adaptative | OpenCV | Seuillage adaptatif (`adaptiveThreshold`) | **Élevé** — améliore contraste texte/fond |
| Débruitage | OpenCV | `fastNlMeansDenoising` pour réduire le bruit Gaussien | **Modéré** — réduit les faux caractères |
| Correction de perspective | OpenCV | Homographie inverse pour documents photographiés | **Très élevé** — corrige la distorsion smartphone |
| Normalisation DPI | Pillow | Résolution cible 300 DPI | **Modéré** — standard recommandé Tesseract |

---

### Étape 2 — OCR (Tesseract v5)

Tesseract v5 (moteur LSTM) est utilisé comme **unique moteur OCR**. Il produit trois types de sorties exploitées par les étapes suivantes.

| Mode de sortie | Format | Utilisation dans le pipeline |
|----------------|--------|------------------------------|
| Texte brut | `.txt` | Entrée du TF-IDF pour la classification NLP |
| TSV (avec coordonnées) | `.tsv` | Extraction features manuelles : `avg_conf_ocr`, `nb_lines`, positions des entités |
| hOCR | `.html` | Extraction structurée avec boîtes englobantes (NER positionnel) |

> **Configuration Tesseract recommandée**
> - Langue : `fra` — pack `tesseract-lang-fra` obligatoire.
> - Mode : `--oem 1` (moteur LSTM uniquement) + `--psm 6` (bloc de texte uniforme).
> - Résolution d'entrée : **300 DPI minimum** (normalisée en Étape 1).
> - Preprocessing obligatoire avant OCR : deskew + binarisation adaptative + débruitage.
> - Score de confiance : colonne `conf` du TSV (0–100), utilisé directement dans les features et le Score Confiance final.

---

### Étape 3 — Classification NLP (TF-IDF → Random Forest)

La classification du type de document repose sur la **vectorisation TF-IDF du texte brut** produit par Tesseract. Le vecteur TF-IDF est directement passé au Random Forest. Les features manuelles sont réservées à la détection d'anomalies (étape 4).

> **Fonctionnement du TF-IDF sur le texte OCR brut**
> - **Entrée** : texte brut Tesseract (concaténation de la colonne `text` du TSV).
> - **Vocabulaire** : top 500 tokens les plus discriminants entre les 7 classes documentaires.
> - **Tokens clés par classe** : `FACTURE` → `['facture', 'échéance', 'iban', 'ttc']`, `DEVIS` → `['devis', 'proposition', 'validité']`, `KBIS` → `['immatriculation', 'rcs', 'greffe']`, etc.
> - **Normalisation** : `TfidfVectorizer(sublinear_tf=True, min_df=2)` pour réduire le bruit OCR.
> - **Sortie** : vecteur de 500 dimensions + probabilité par classe (`predict_proba`) → `classif_conf`.

---

### Étape 4 — Extraction d'Infos (Regex + NER)

Une fois le type de document classifié, l'extraction d'entités est **guidée par ce type** : les regex et patterns NER appliqués diffèrent selon qu'on traite une Facture, un Devis ou un Kbis.

| Entité | Méthode | Regex / Pattern | Documents cibles |
|--------|---------|-----------------|-----------------|
| SIRET | Regex | `\b\d{3}\s?\d{3}\s?\d{3}\s?\d{5}\b` | Tous documents |
| IBAN | Regex normalisée | `FR\d{2}[\s\d]{20,27}` | Facture, RIB |
| Montant HT/TVA/TTC | Regex + contexte | `\d{1,6}[.,]\d{2}\s*€` + label précédent | Facture, Devis |
| Date (émission/échéance) | Regex | `\d{2}/\d{2}/\d{4}` | Facture, Devis, BDC |
| Numéro de document | Regex | `(FACT\|DEV\|BDC)-\d{4}-\d{4}` | Facture, Devis, BDC |
| Raison Sociale | NER (spaCy `fr`) | Entité `ORG` dans le bloc en-tête | Tous documents |
| Gérant | NER (spaCy `fr`) | Entité `PER` au voisinage de « Gérant » | Kbis |

---

### Étape 5 — Score Confiance Composite

Le Score Confiance est un indicateur de fiabilité global calculé pour chaque document, **stocké dans `annotations.csv` et `ground_truth.json`**.

| Composante | Description | Plage | Poids |
|------------|-------------|-------|-------|
| OCR Confidence | Score de confiance moyen Tesseract (`mean` de la colonne `conf` du TSV) | 0 – 100 % | 50 % |
| Classification Confidence | Probabilité max. du Random Forest pour la classe prédite (`predict_proba`) | 0 – 100 % | 50 % |
| **Score Confiance Final** | `0.5 × OCR_conf + 0.5 × classif_conf` | 0 – 100 % | — |

**Règles de seuillage :**

| Seuil | Action |
|-------|--------|
| Score **≥ 88 %** | ✅ Traitement automatique validé |
| Score **70 – 87 %** | ⚠️ Résultat accepté, signalé pour vérification opportuniste |
| Score **< 70 %** | 🔴 Document envoyé en revue manuelle obligatoire |

---

## 4. Typologie des Documents

### 4.1 Le « Triptyque » de Vente — Cœur du Projet

| # | Classe | Description | Champs OCR critiques |
|---|--------|-------------|---------------------|
| 1 | `Devis` | Proposition commerciale initiale | N° devis, date, SIRET fournisseur, montant HT/TVA/TTC |
| 2 | `Bon_Commande` | Validation de l'achat par le client | N° BDC, date signature, SIRET client |
| 3 | `Facture` | Demande de paiement finale | N° facture, IBAN, date échéance, montant TTC |

### 4.2 Classes Supplémentaires

| # | Classe | Description | Rôle dans la détection d'anomalies |
|---|--------|-------------|-----------------------------------|
| 4 | `RIB` | Relevé d'Identité Bancaire | Croiser l'IBAN du RIB avec l'IBAN de la facture |
| 5 | `Contrat_Prestation` | Document textuel multi-pages | Stress-test OCR sur documents longs |
| 6 | `Kbis` | Preuve d'immatriculation officielle | Croiser SIRET, gérant et adresse du siège |
| 7 | `Avenant_Devis` | Modification d'un devis existant | Gestion des changements de version |

### 4.3 Répartition Cible des Classes

| Classe | Proportion cible | Justification |
|--------|-----------------|---------------|
| `Facture` | 30 % | Document pivot — toujours présent dans chaque dossier |
| `Devis` | 20 % | Présent dans ~80 % des dossiers |
| `Bon_Commande` | 15 % | Présent dans ~60 % des dossiers |
| `RIB` | 10 % | Pièce jointe fréquente |
| `Contrat_Prestation` | 10 % | Contexte long-document, stress-test OCR |
| `Kbis` | 8 % | Pièce d'identité entreprise |
| `Avenant_Devis` | 7 % | Cas de modification en cours de dossier |

---

## 5. Types et Niveaux de Difficulté des Anomalies

Les anomalies injectées couvrent tous les cas de fraude documentaire identifiés. La détection est effectuée par le Random Forest sur les **features cross-document**, après extraction par Regex + NER.

| Type d'anomalie | Champ affecté | Feature RF déclenchée | Niveau |
|-----------------|--------------|----------------------|--------|
| Altération d'identité | SIRET fournisseur | `siret_fournisseur_match = False` | L1 à L3 |
| Altération financière | Montant TTC facture | `delta_montant_ttc_pct > seuil` | L2 / L3 |
| Altération de RIB | IBAN facture vs RIB | `iban_rib_match = False` | L3 |
| Erreur de calcul TVA | HT + TVA ≠ TTC | `tva_calcul_ok = False` | L2 |
| Discordance de dates | Dates devis/BDC/facture | `date_coherence_ok = False` | L2 / L3 |

### Niveaux de difficulté

| Niveau | Label | Exemple | Impact OCR / RF |
|--------|-------|---------|-----------------|
| 1 — Évident | `ANOMALIE_L1` | SIRET entièrement différent (9 chiffres changés) | Faible — divergence claire |
| 2 — Subtil | `ANOMALIE_L2` | TTC modifié de +2 % (1 000 € → 1 020 €) | Modéré — recalcul nécessaire |
| 3 — Très subtil | `ANOMALIE_L3` | Un seul chiffre IBAN ou date décalée d'1 jour | Élevé — risque de confusion OCR |

**Répartition visée dans les dossiers ANOMALIE :** 40 % L1 / 35 % L2 / 25 % L3.

---

## 6. Volumes et Répartition du Dataset

### 6.1 Répartition par Split

| Split | Nb. dossiers | Nb. docs estimé | Proportion OK / ANOMALIE |
|-------|-------------|-----------------|--------------------------|
| **Train** | 700 | ~2 800 | 65 % / 35 % |
| **Validation** | 150 | ~600 | 65 % / 35 % |
| **Test** | 150 | ~600 | **50 % / 50 %** |
| **Total** | **1 000** | **~4 000** | — |

> Le split Test est volontairement équilibré à 50/50 pour mesurer la détection d'anomalies sans biais de classe.

### 6.2 Versions d'Altération par Document

| Version | Type d'altération | Conf. OCR attendue | Nb. fichiers estimé |
|---------|------------------|--------------------|---------------------|
| `v0` — PDF propre | Aucune (original numérique) | > 95 % | ~1 000 |
| `v1` — Scan léger | 1 effet aléatoire | 85 – 95 % | ~1 000 |
| `v2` — Scan dégradé | 2 effets combinés | 70 – 85 % | ~1 000 |
| `v3` — Smartphone | 3 effets combinés | < 70 % | ~1 000 |

---

## 7. Format des Annotations

### 7.1 Colonnes du fichier `annotations.csv`

| Colonne | Type | Description | Exemple |
|---------|------|-------------|---------|
| `dossier_id` | `str` | Identifiant unique du dossier | `dossier_00042` |
| `label` | `str` | Conformité globale du dossier | `OK` / `ANOMALIE` |
| `split` | `str` | Appartenance au jeu de données | `train` / `val` / `test` |
| `anomalie_type` | `str` | Nature de l'anomalie (vide si OK) | `alteration_rib` |
| `anomalie_niveau` | `int` | Niveau de difficulté 1/2/3 (vide si OK) | `3` |
| `document_affecte` | `str` | Fichier portant l'anomalie | `facture_v2.jpg` |
| `champ_affecte` | `str` | Champ précis modifié | `iban` |
| `valeur_correcte` | `str` | Valeur attendue (ground truth) | `FR7630006000011234567890189` |
| `valeur_alteree` | `str` | Valeur frauduleuse introduite | `FR7630006000011234567891189` |
| `version_doc` | `str` | Version altérée utilisée (v0/v1/v2/v3) | `v2` |
| `ocr_conf_moy` | `float` | Confiance OCR moyenne Tesseract (`mean(TSV.conf)`) | `78.4` |
| `classif_conf` | `float` | Probabilité max. du Random Forest (`predict_proba`) | `0.91` |
| `score_confiance_final` | `float` | Score composite = `0.5×ocr_conf + 0.5×classif_conf` | `84.7` |
| `nb_documents` | `int` | Nombre de fichiers dans le dossier | `4` |

### 7.2 Exemple de lignes `annotations.csv`

```csv
dossier_id,label,split,anomalie_type,anomalie_niveau,document_affecte,champ_affecte,valeur_correcte,valeur_alteree,version_doc,ocr_conf_moy,classif_conf,score_confiance_final,nb_documents
dossier_00001,OK,train,,,,,,, v0,97.2,0.96,96.6,3
dossier_00002,ANOMALIE,train,alteration_rib,3,facture_v2.jpg,iban,FR7630006000011234567890189,FR7630006000011234567891189,v2,76.8,0.89,82.9,4
dossier_00003,ANOMALIE,val,alteration_financiere,2,facture_v1.jpg,montant_ttc,1000.00,1020.00,v1,89.1,0.91,90.1,3
```

### 7.3 Structure du `ground_truth.json`

```json
{
  "dossier_id": "dossier_00001",
  "label": "OK",
  "fournisseur": {
    "raison_sociale": "DUPONT SOLUTIONS SAS",
    "siret": "12345678900012",
    "adresse": "12 rue de la Paix, 75001 Paris",
    "iban": "FR7630006000011234567890189",
    "bic": "BNPAFRPPXXX"
  },
  "client": {
    "raison_sociale": "MARTIN & ASSOCIÉS SARL",
    "siret": "98765432100023",
    "adresse": "5 avenue des Fleurs, 69001 Lyon"
  },
  "documents": {
    "devis":        { "numero": "DEV-2026-0042",  "date_emission": "2026-01-15", "montant_ht": 2500.00, "tva": 500.00, "montant_ttc": 3000.00 },
    "bon_commande": { "numero": "BDC-2026-0087",  "date_signature": "2026-01-20" },
    "facture":      { "numero": "FACT-2026-0099", "date_emission": "2026-02-01", "date_echeance": "2026-03-01", "montant_ht": 2500.00, "tva": 500.00, "montant_ttc": 3000.00 }
  },
  "features_rf": {
    "has_siret": true,
    "has_iban": true,
    "nb_montants": 3,
    "nb_lines": 42,
    "avg_conf_ocr": 94.2,
    "ocr_mode": "tesseract_lstm",
    "siret_fournisseur_match": true,
    "iban_rib_match": true,
    "delta_montant_ttc_pct": 0.0,
    "date_coherence_ok": true,
    "tva_calcul_ok": true,
    "classif_conf": 0.96,
    "score_confiance_final": 95.1
  }
}
```

---

## 8. Structure de Sortie du Dataset

```
/dataset/
  ├── annotations.csv                    # Labels + scores OCR + confiance RF
  ├── features/
  │   ├── train_features.csv             # Vecteurs TF-IDF pré-calculés (train)
  │   ├── val_features.csv
  │   └── test_features.csv
  ├── train/
  │   ├── dossier_00001_conforme/
  │   │   ├── devis_v0.pdf               # Original numérique propre (OCR conf. > 95 %)
  │   │   ├── devis_v1.jpg               # Scan bruité — 1 effet (OCR conf. ~90 %)
  │   │   ├── bdc_v2.jpg                 # Scan dégradé — 2 effets (OCR conf. ~78 %)
  │   │   ├── facture_v0.pdf
  │   │   ├── facture_v3.jpg             # Smartphone dégradé — 3 effets (OCR conf. < 70 %)
  │   │   ├── ground_truth.json          # Vérité terrain + features RF pré-calculées
  │   │   └── ocr_outputs/
  │   │       ├── devis_v1.txt           # Texte brut Tesseract → TF-IDF
  │   │       ├── devis_v1.tsv           # Conf. par mot → features + Score Confiance
  │   │       └── devis_v1.hocr          # Positions → NER positionnel
  │   └── dossier_00002_non_conforme/
  │       └── ...
  ├── val/
  │   └── ...
  └── test/                              # Jeu de test caché, non utilisé durant l'entraînement
      └── ...
```

---

## 9. Métriques d'Évaluation Cibles

| Étape / Tâche | Modèle | Métrique principale | Objectif cible |
|---------------|--------|---------------------|----------------|
| Classification documentaire | TF-IDF → Random Forest | Accuracy, F1-macro | ≥ 90 % |
| Extraction d'entités (SIRET, IBAN, montants) | Regex + NER (spaCy `fr`) | F1-score par entité | ≥ 85 % |
| Détection d'anomalies cross-document | Random Forest (features cross-doc) | F1-score, **Rappel prioritaire** | ≥ 85 % rappel |
| Anomalies L3 (très subtiles) | Random Forest + tolérance OCR | Rappel spécifique L3 | ≥ 65 % |
| Qualité OCR Tesseract (v0 → v3) | Tesseract v5 LSTM | Conf. moy. par version | v0 > 95 %, v3 > 60 % |
| Robustesse pipeline v0 → v3 | Pipeline complet | Dégradation F1 classification | < 10 % de perte |
| Score Confiance final en production | Score composite | Taux de revue manuelle (seuil < 70 %) | < 15 % des docs |

> **Rappel prioritaire** : dans un contexte de lutte contre la fraude documentaire, le Rappel (ne manquer aucune anomalie) est prioritaire sur la Précision. Le seuil de décision du Random Forest sera calibré sur le split de validation pour maximiser le rappel. Un faux positif est moins grave qu'une fraude non détectée.

---

## 10. Moteur de Génération — Pipeline Technique

Les factures sont générées de manière synthétique avec Faker, puis rendues via plusieurs templates réalistes (classic/modern/compact). Des dégradations visuelles simulent différents niveaux de qualité d'image : rotation, flou, contraste dégradé et conditions type smartphone (v3).

| Étape | Outil | Description |
|-------|-------|-------------|
| 1. Génération sémantique | Python + INSEE + Faker | Création du `ground_truth.json` avec toutes les valeurs cohérentes |
| 2. Injection d'anomalies | Python | Altération contrôlée selon niveau L1/L2/L3 |
| 3. Templating HTML | Jinja2 | Injection JSON → templates HTML/CSS (variations visuelles : couleurs, polices, layouts) |
| 4. Rendu PDF/PNG | WeasyPrint + Pillow | HTML → PDF (`v0`) → PNG haute résolution (base pour altérations) |
| 5. Altérations visuelles | OpenCV + Albumentations | 0 à 3 effets de bruit pour produire `v1`, `v2`, `v3` |
| 6. OCR Tesseract | Tesseract v5 (LSTM) | Exécution sur chaque image prétraitée → sortie `.txt`, `.tsv`, `.hocr` |
| 7. Feature Engineering | Python (pandas + sklearn) | Calcul TF-IDF sur texte brut → `features/*.csv` |
