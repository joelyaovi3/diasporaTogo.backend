import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
    messag: String,
    commentAuth: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
    Chat:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
    },
    createdAt: {
        type: Date,
        default: Date.now
      },
},{
    timestamps: true,
  });

const commentModel = mongoose.model('Comment', commentSchema);
export default commentModel;