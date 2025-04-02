const mongoose = require("mongoose")


const UserDataSchema = new mongoose.Schema({
    userId:{
        type:String,
        unique:true
        
    },
    usedTranscriptionTimeInMilliSec:String,
    totalTranscriptionTimeInMilliSec:String,
    linkedinTextConversionCount:Number,
    totalLinkedinTextConversionCount:Number,
    usedTextEnhanceCount : Number,
    totalTextEnhanceCount:Number


},{
    timestamp:true
})

const UserDataModel =  mongoose.model("userData",UserDataSchema)

module.exports = UserDataModel