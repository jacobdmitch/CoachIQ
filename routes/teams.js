import express from 'express';
const router=express.Router();
router.get('/',(req,res)=>{res.json({success:true,teams:[]});});
router.post('/',(req,res)=>{res.json({success:true,team:{id:1,name:req.body.name}});});
export default router;
