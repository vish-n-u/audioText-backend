const mongoose = require("mongoose")

const userSchema =new  mongoose.Schema({
    userId:{
        type:String,
        unique:true
    },
},{
    timestamps:true
})

const UserModel = mongoose.model("user",userSchema)
module.exports = UserModel