// models/blockModel.js
import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema({
  blocker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  blocked: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
blockSchema.index({ blocked: 1 });

blockSchema.statics.isBlocked = async function(userA, userB) {
  return !!(await this.findOne({
    $or: [
      { blocker: userA, blocked: userB },
      { blocker: userB, blocked: userA }
    ]
  }));
};

const Block = mongoose.model('Block', blockSchema);
export default Block;
