const UserModel = require("../model/User")


const doesUserExist = async(req,res,next)=>{
    try{
        console.log("req.body.uid==>",req.body.uid)
        let user = UserModel.findById(req.body.uid)
        if(!user){
            return res.staus(404).send(JSON.stringify("Invalid User"))
        }
        next()
    }
    catch(e){
      return  res.status(500).send(JSON.stringify("Internal server Error"));
    }
}


module.exports ={
    doesUserExist
}