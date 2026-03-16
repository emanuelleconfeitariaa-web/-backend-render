const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
  {
    id: { type: String, default: "" },
    type: { type: String, default: "" }, // FREE_SHIPPING | PERCENT | VALUE
    value: { type: Number, default: 0 },
    label: { type: String, default: "" },

    active: { type: Boolean, default: true },
    used: { type: Boolean, default: false },
    uses_left: { type: Number, default: 1 }
  },
  { _id: false }
);

const ClientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    notes: { type: String, default: "" },

    address: {
      street: { type: String, default: "" },
      number: { type: String, default: "" },
      neighborhood: { type: String, default: "" },
      city: { type: String, default: "" },
      complement: { type: String, default: "" },
      zip: { type: String, default: "" }
    },

    coupons: { type: [CouponSchema], default: [] }
  },
  { timestamps: true }
);

ClientSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (_, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
  }
});

module.exports = mongoose.model("Client", ClientSchema);
