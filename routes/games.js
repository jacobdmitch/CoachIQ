import express from 'express';
const router=express.Router();
router.get('/',(req,res)=>{res.json({success:true,games:[]});});
router.post('/',(req,res)=>{res.json({success:true,game:{id:1,...req.body}});});
export default router;
