const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
  {
    id: { type: String, default: "" },
    type: { type: String, default: "" },
    value: { type: Number, default: 0 },
    label: { type: String, default: "" }
  },
  { _id: false }
);

const OrderItemSchema = new mongoose.Schema(
  {
    product_id: { type: String, default: "" },
    name: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },

    created_at: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ["NOVO", "ACEITO", "RECUSADO", "CANCELADO", "CONCLUIDO"],
      default: "NOVO"
    },

    paid: { type: Boolean, default: false },
    paid_at: { type: Date, default: null },

    type: {
      type: String,
      enum: ["ENTREGA", "RETIRADA"],
      default: "RETIRADA"
    },

    customer_name: { type: String, default: "", trim: true },
    customer_phone: { type: String, default: "", trim: true },
    address: { type: String, default: "" },

    payment: { type: String, default: "" },
    notes: { type: String, default: "" },

    scheduled_for: { type: String, default: null },
    need_nfce: { type: Boolean, default: false },
    cpf: { type: String, default: "" },

    distance_km: { type: Number, default: null },

    shipping: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    total: { type: Number, required: true, min: 0 },

    coupon_applied: { type: CouponSchema, default: null },

    items: { type: [OrderItemSchema], default: [] }
  },
  { timestamps: true }
);

OrderSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (_, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
  }
});

module.exports = mongoose.model("Order", OrderSchema);
