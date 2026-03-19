const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['facture', 'devis', 'attestation', 'kbis', 'rib', 'bon_commande', 'autre'], 
      default: 'autre' 
    },
    User_id: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    }, 
    status: { 
      type: String, 
      enum: ['pending', 'processing', 'validated', 'error'], 
      default: 'pending' 
    },
    dossier_id: { type: String, index: true },
    file_path: { type: String, required: true }, 
    
    extracted_data: {
      siret: String,
      tva: String,
      montant_ht: Number,
      montant_ttc: Number,
      date_emission: Date,
      date_expiration: Date,
      date_signature: Date
    },
    extracted_fields: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    verification_flags: {
      sirene_valid: Boolean,
      date_valid: Boolean,
      siret_match: Boolean
    },
    classification_confidence: Number,
    ocr_confidence: Number,
    conformity: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" }
  }
);

const Document = mongoose.model("Document", documentSchema);

module.exports = { Document };
