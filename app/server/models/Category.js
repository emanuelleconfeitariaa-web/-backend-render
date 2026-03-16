const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, default: "" },
    active: { type: Boolean, default: true },
    sort_order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

CategorySchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (_, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
  }
});

module.exports = mongoose.model("Category", CategorySchema);