const mongoose = require("mongoose");

const AddonItemSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    price: { type: Number, default: 0 }
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },

    category: { type: String, trim: true, default: "" },
    subcategory: { type: String, trim: true, default: "" },
    description: { type: String, default: "" },

    featured: { type: Boolean, default: false },

    stock_enabled: { type: Boolean, default: true },
    stock_qty: { type: Number, default: 0 },
    low_stock_alert: { type: Number, default: 5 },

    paused: { type: Boolean, default: false },

    image_url: { type: String, default: "" },
    images: { type: [String], default: [] },

    addons: { type: [AddonItemSchema], default: [] },
    discount_percent: { type: Number, default: 0 },

    sort_order: { type: Number, default: 0 },

    active: { type: Boolean, default: true },

    // opcional: manter para o futuro, sem quebrar o legado
    category_id: { type: String, default: null }
  },
  { timestamps: true }
);

ProductSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (_, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
  }
});

module.exports = mongoose.model("Product", ProductSchema);
