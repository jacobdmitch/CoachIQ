import express from 'express';
const router=express.Router();
router.get('/',(req,res)=>{res.json({success:true,athletes:[]});});
router.post('/',(req,res)=>{res.json({success:true,athlete:{id:1,...req.body}});});
export default router;
