import express from 'express';
const router=express.Router();
router.get('/',(req,res)=>{res.json({success:true,stats:[]});});
router.post('/',(req,res)=>{res.json({success:true,stat:{id:1,...req.body}});});
export default router;
