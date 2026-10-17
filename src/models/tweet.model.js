import mongoose,{Schema} from "mongoose";

const tweetSchema = new Schema({
    content:{
        type:String,
        required:true,
        maxlength:280
    },
    owner:{
        type:Schema.Types.ObjectId,
        ref:"User"
    }
},{timestamp:true})

export const Tweet = mongoose.model("Tweet", tweetSchema)