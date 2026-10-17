import mongoose,{Schema} from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";


const commentSchema = new Schema({
content:{
    type:String,
    required:true},
video:{
    type:Schema.Types.ObjectId,
    ref:"Video"
},
owner:{
    type:Schema.Types.ObjectId,
    ref:"User"  
}

},{timestamp:true
    })

commentSchema.plugins(mongooseAggregatePaginate)


export const comment = mongoose.model("Comment",commentSchema)